import { Transaction } from '@mysten/sui/transactions';
import { normalizeStructTag, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { Base } from './base';
import Decimal from 'decimal.js';
import { Pool } from './pool';
import {
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
  MIN_TICK_INDEX,
  MAX_TICK_INDEX,
} from '../constants';
import { BN } from 'bn.js';
import * as suiKit from '../utils/sui-kit';
import { getMoveObjectType, getObjectFields, getObjectId } from './legacy';

export const ONE_MINUTE = 60 * 1000;
const MAX_TICK_STEP = 100;

export declare module Trade {
  export interface SwapOptions {
    routes: {
      pool: string;
      a2b: boolean;
      /**
       * ```typescript
       * const swapResult = sdk.trade.computeSwapResult({ ... })
       * const nextTickIndex = sdk.math.bitsToNumber(swapResult.tick_current_index.bits)
       * ```
       */
      nextTickIndex: number;
    }[];
    coinTypeA: string;
    coinTypeB: string;
    address: string;
    amountA: string | number;
    amountB: string | number;
    amountSpecifiedIsInput: boolean;
    slippage: string;
    deadline?: number;
    txb?: Transaction;
  }

  export interface ComputeSwapResultOptions {
    pools: { pool: string; a2b: boolean }[];
    address: string;
    amountSpecified: string | number;
    amountSpecifiedIsInput: boolean;
    tickStep?: number;
  }

  export interface ComputeSwapResultOptionsV2 {
    pools: { pool: string; a2b: boolean; amountSpecified: string | number }[];
    address: string;
    amountSpecifiedIsInput: boolean;
    tickStep?: number;
  }

  export interface ComputedSwapResult {
    a_to_b: boolean;
    amount_a: string;
    amount_b: string;
    fee_amount: string;
    is_exact_in: boolean;
    liquidity: string;
    pool: string;
    protocol_fee: string;
    recipient: string;
    sqrt_price: string;
    tick_current_index: { bits: number };
    tick_pre_index: { bits: number };
  }

  export interface SwapWithReturnOptions {
    poolId: string;
    coinType: string;
    amountA: string;
    amountB: string;
    swapAmount: string;
    nextTickIndex: number;
    slippage: string;
    amountSpecifiedIsInput: boolean;
    a2b: boolean;
    address: string;
    deadline?: number;
    txb?: Transaction;
  }

  export interface SwapWithPartnerOptions {
    poolId: string;
    swapAmount: string;
    amountSpecifiedIsInput: boolean;
    slippage: string;
    a2b: boolean;
    address: string;
    deadline?: number;
    txb?: Transaction;
    partner: string;
  }
}

export class Trade extends Base {
  async swap(options: Trade.SwapOptions): Promise<Transaction> {
    const { coinTypeA, coinTypeB, address, amountSpecifiedIsInput, slippage } = options;
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const contract = await this.contract.getConfig();
    const routes = await Promise.all(
      options.routes.map(async (item) => {
        const typeArguments = await this.pool.getPoolTypeArguments(item.pool);
        const [coinA, coinB] = await Promise.all([
          this.coin.getMetadata(typeArguments[0]),
          this.coin.getMetadata(typeArguments[1]),
        ]);
        return {
          ...item,
          coinA,
          coinB,
          typeArguments: typeArguments,
        };
      }),
    );
    const coinIds = await this.coin.selectTradeCoins(address, coinTypeA, amountA);
    const { functionName, typeArguments } = this.getFunctionNameAndTypeArguments(
      routes.map(({ typeArguments }) => typeArguments),
      coinTypeA,
      coinTypeB,
    );

    const sqrtPrices = routes.map(({ nextTickIndex, coinA, coinB, a2b }) => {
      const nextTickPrice = this.math.tickIndexToPrice(
        nextTickIndex,
        coinA.decimals,
        coinB.decimals,
      );
      return this.sqrtPriceWithSlippage(
        nextTickPrice,
        slippage,
        a2b,
        coinA.decimals,
        coinB.decimals,
      );
    });

    const txb = options.txb || new Transaction();
    txb.moveCall({
      target: `${contract.PackageId}::swap_router::${functionName}`,
      typeArguments: typeArguments,
      arguments: [
        ...routes.map(({ pool }) => txb.object(pool)),
        txb.makeMoveVec({
          elements: this.coin.convertTradeCoins(txb, coinIds, coinTypeA, amountA),
        }),
        txb.pure.u64((amountSpecifiedIsInput ? amountA : amountB).toFixed(0)),
        txb.pure.u64(
          this.amountOutWithSlippage(
            amountSpecifiedIsInput ? amountB : amountA,
            slippage,
            amountSpecifiedIsInput,
          ),
        ),
        ...sqrtPrices.map((price) => txb.pure.u128(price)),
        txb.pure.bool(amountSpecifiedIsInput),
        txb.pure.address(address),
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async swapWithPartner(options: Trade.SwapWithPartnerOptions) {
    const {
      poolId,
      swapAmount,
      address,
      slippage,
      amountSpecifiedIsInput,
      a2b,
      partner,
    } = options;
    const txb = options.txb || new Transaction();

    const typeArguments = await this.pool.getPoolTypeArguments(poolId);
    const coinTypeA = typeArguments[0];
    const coinTypeB = typeArguments[1];
    const contract = await this.contract.getConfig();

    const swapResult = await this.computeSwapResultV2({
      pools: [
        {
          pool: poolId,
          a2b: a2b,
          amountSpecified: swapAmount,
        },
      ],
      address: address,
      amountSpecifiedIsInput,
    });

    const amountThreshold = this.amountOutWithSlippage(
      new Decimal(
        a2b == amountSpecifiedIsInput ? swapResult[0]!.amount_b : swapResult[0]!.amount_a,
      ),
      slippage,
      amountSpecifiedIsInput,
    );

    let sendCoinA;
    let sendCoinB;
    let mergeCoin;
    if (a2b) {
      [sendCoinA, mergeCoin] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeA,
        new Decimal(amountSpecifiedIsInput ? swapAmount : amountThreshold).toNumber(),
        txb,
      );
      sendCoinB = this.coin.zero(coinTypeB, txb);
    } else {
      [sendCoinB, mergeCoin] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeB,
        new Decimal(amountSpecifiedIsInput ? swapAmount : amountThreshold).toNumber(),
        txb,
      );
      sendCoinA = this.coin.zero(coinTypeA, txb);
    }

    const [coinA, coinB] = txb.moveCall({
      target: `${contract.PackageId}::swap_router::swap_with_partner`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(poolId),
        txb.object(partner),
        sendCoinA!,
        sendCoinB!,
        txb.pure.bool(a2b),
        txb.pure.u64(swapAmount),
        txb.pure.u64(amountThreshold),
        txb.pure.u128(this.getDefaultSqrtPriceLimit(a2b)),
        txb.pure.bool(amountSpecifiedIsInput),
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });
    if (mergeCoin) {
      txb.transferObjects([mergeCoin], address);
    }
    txb.transferObjects([coinA!, coinB!], address);
    return txb;
  }

  async swapWithPartnerWithReturn(options: Trade.SwapWithPartnerOptions) {
    const {
      poolId,
      swapAmount,
      address,
      slippage,
      amountSpecifiedIsInput,
      a2b,
      partner,
    } = options;
    const txb = options.txb || new Transaction();

    const typeArguments = await this.pool.getPoolTypeArguments(poolId);
    const coinTypeA = typeArguments[0];
    const coinTypeB = typeArguments[1];
    const contract = await this.contract.getConfig();

    const swapResult = await this.computeSwapResultV2({
      pools: [
        {
          pool: poolId,
          a2b: a2b,
          amountSpecified: swapAmount,
        },
      ],
      address: address,
      amountSpecifiedIsInput,
    });

    const amountThreshold = this.amountOutWithSlippage(
      new Decimal(
        a2b == amountSpecifiedIsInput ? swapResult[0]!.amount_b : swapResult[0]!.amount_a,
      ),
      slippage,
      amountSpecifiedIsInput,
    );

    let sendCoinA;
    let sendCoinB;
    let mergeCoin;
    if (a2b) {
      [sendCoinA, mergeCoin] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeA,
        new Decimal(amountSpecifiedIsInput ? swapAmount : amountThreshold).toNumber(),
        txb,
      );
      sendCoinB = this.coin.zero(coinTypeB, txb);
    } else {
      [sendCoinB, mergeCoin] = await this.coin.takeAmountFromCoins(
        address,
        coinTypeB,
        new Decimal(amountSpecifiedIsInput ? swapAmount : amountThreshold).toNumber(),
        txb,
      );
      sendCoinA = this.coin.zero(coinTypeA, txb);
    }

    const [coinA, coinB] = txb.moveCall({
      target: `${contract.PackageId}::swap_router::swap_with_partner`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(poolId),
        txb.object(partner),
        sendCoinA!,
        sendCoinB!,
        txb.pure.bool(a2b),
        txb.pure.u64(swapAmount),
        txb.pure.u64(amountThreshold),
        txb.pure.u128(this.getDefaultSqrtPriceLimit(a2b)),
        txb.pure.bool(amountSpecifiedIsInput),
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });
    if (mergeCoin) {
      txb.transferObjects([mergeCoin], address);
    }
    return {
      txb,
      coinA,
      coinB,
    };
  }

  async computeSwapResult(
    options: Trade.ComputeSwapResultOptions,
  ): Promise<Trade.ComputedSwapResult[]> {
    const { pools, amountSpecified, amountSpecifiedIsInput, address, tickStep } = options;
    const contract = await this.contract.getConfig();
    const poolIds = pools.map((pool) => pool.pool);
    let poolResult = await suiKit.multiGetObjects(this.provider, poolIds, {
      showContent: true,
    });
    const txb = new Transaction();
    poolResult.map(async (pool) => {
      const fields = getObjectFields(pool) as unknown as Pool.PoolFields;
      const _pool = pools.find((item) => item.pool === fields.id.id);

      const current_tick = this.math.bitsToNumber(fields.tick_current_index.fields.bits);
      let min_tick = current_tick - fields.tick_spacing * (tickStep || MAX_TICK_STEP);
      let max_tick = current_tick + fields.tick_spacing * (tickStep || MAX_TICK_STEP);
      min_tick = min_tick < MIN_TICK_INDEX ? MIN_TICK_INDEX : min_tick;
      max_tick = max_tick > MAX_TICK_INDEX ? MAX_TICK_INDEX : max_tick;

      const types = this.pool.parsePoolType(getMoveObjectType(pool)!);

      txb.moveCall({
        target: `${contract.PackageId}::pool_fetcher::compute_swap_result`,
        typeArguments: types,
        arguments: [
          // pool
          txb.object(fields.id.id),
          // a_to_b
          txb.pure.bool(_pool!.a2b),
          // amount_specified
          txb.pure.u128(new Decimal(amountSpecified).toFixed(0)),
          // amount_specified_is_input
          txb.pure.bool(amountSpecifiedIsInput),
          // sqrt_price_limit
          txb.pure.u128(
            this.math
              .tickIndexToSqrtPriceX64(_pool!.a2b ? min_tick : max_tick)
              .toString(),
          ),
          // clock
          txb.object(SUI_CLOCK_OBJECT_ID),
          // versioned
          txb.object(contract.Versioned),
        ],
      });
    });
    const result = await this.provider.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: address,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.events.map((event) => {
      return event.parsedJson as Trade.ComputedSwapResult;
    });
  }

  async computeSwapResultV2(
    options: Trade.ComputeSwapResultOptionsV2,
  ): Promise<Trade.ComputedSwapResult[]> {
    const { pools, amountSpecifiedIsInput, address, tickStep } = options;
    const contract = await this.contract.getConfig();
    const poolIds = pools.map((pool) => pool.pool);
    let poolResults = await suiKit.multiGetObjects(
      this.provider,
      Array.from(new Set(poolIds)),
      {
        showContent: true,
      },
    );
    const txb = new Transaction();
    pools.forEach(async (pool) => {
      const poolObject = poolResults.find(
        (poolResult) => getObjectId(poolResult) === pool.pool,
      )!;
      const fields = getObjectFields(poolObject) as unknown as Pool.PoolFields;

      const current_tick = this.math.bitsToNumber(fields.tick_current_index.fields.bits);
      let min_tick = current_tick - fields.tick_spacing * (tickStep || MAX_TICK_STEP);
      let max_tick = current_tick + fields.tick_spacing * (tickStep || MAX_TICK_STEP);
      min_tick = min_tick < MIN_TICK_INDEX ? MIN_TICK_INDEX : min_tick;
      max_tick = max_tick > MAX_TICK_INDEX ? MAX_TICK_INDEX : max_tick;

      const types = this.pool.parsePoolType(getMoveObjectType(poolObject)!);

      txb.moveCall({
        target: `${contract.PackageId}::pool_fetcher::compute_swap_result`,
        typeArguments: types,
        arguments: [
          // pool
          txb.object(fields.id.id),
          // a_to_b
          txb.pure.bool(pool.a2b),
          // amount_specified
          txb.pure.u128(new Decimal(pool.amountSpecified).toFixed(0)),
          // amount_specified_is_input
          txb.pure.bool(amountSpecifiedIsInput),
          // sqrt_price_limit
          txb.pure.u128(
            this.math.tickIndexToSqrtPriceX64(pool.a2b ? min_tick : max_tick).toString(),
          ),
          // clock
          txb.object(SUI_CLOCK_OBJECT_ID),
          // versioned
          txb.object(contract.Versioned),
        ],
      });
    });
    const result = await this.provider.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: address,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.events.map((event) => {
      return event.parsedJson as Trade.ComputedSwapResult;
    });
  }

  async swapWithReturn(options: Trade.SwapWithReturnOptions) {
    const {
      poolId,
      coinType,
      amountA,
      amountB,
      swapAmount,
      address,
      slippage,
      amountSpecifiedIsInput,
      nextTickIndex,
      a2b,
    } = options;
    const txb = options.txb || new Transaction();
    const _amountA = new Decimal(amountA);
    const _amountB = new Decimal(amountB);

    const typeArguments = await this.pool.getPoolTypeArguments(poolId);
    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(typeArguments[0]),
      this.coin.getMetadata(typeArguments[1]),
    ]);
    const contract = await this.contract.getConfig();

    const nextTickPrice = this.math.tickIndexToPrice(
      nextTickIndex,
      coinA.decimals,
      coinB.decimals,
    );

    const price = this.sqrtPriceWithSlippage(
      nextTickPrice,
      slippage,
      a2b,
      coinA.decimals,
      coinB.decimals,
    );

    const [sendCoin, mergeCoin] = await this.coin.takeAmountFromCoins(
      address,
      coinType,
      a2b ? _amountA.toNumber() : _amountB.toNumber(),
      txb,
    );

    const [coinVecA, coinVecB] = txb.moveCall({
      target: `${contract.PackageId}::swap_router::swap_${
        a2b ? 'a_b' : 'b_a'
      }_with_return_`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(poolId),
        txb.makeMoveVec({
          elements: [sendCoin!],
        }),
        txb.pure.u64(swapAmount),
        txb.pure.u64(
          this.amountOutWithSlippage(
            new Decimal(a2b ? amountB : amountA),
            slippage,
            amountSpecifiedIsInput,
          ),
        ),
        txb.pure.u128(price),
        txb.pure.bool(amountSpecifiedIsInput),
        txb.pure.address(address),
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    if (mergeCoin) {
      txb.transferObjects([mergeCoin], address);
    }

    return {
      txb,
      coinVecA: a2b ? coinVecB : coinVecA,
      coinVecB: a2b ? coinVecA : coinVecB,
    };
  }

  protected getFunctionNameAndTypeArguments(
    pools: Pool.Types[],
    coinTypeA: string,
    coinTypeB: string,
  ) {
    let typeArguments: string[] = [];
    const functionName: string[] = ['swap'];
    if (pools.length === 1) {
      typeArguments = pools[0]!;
      if (normalizeStructTag(coinTypeA) === normalizeStructTag(typeArguments[0]!)) {
        functionName.push('a', 'b');
      } else {
        functionName.push('b', 'a');
      }
    } else {
      const pool1Args = pools[0]!;
      const pool2Args = pools[1]!;
      if (normalizeStructTag(coinTypeA) === normalizeStructTag(pool1Args[0])) {
        functionName.push('a', 'b');
        typeArguments.push(pool1Args[0], pool1Args[2], pool1Args[1]);
      } else {
        functionName.push('b', 'a');
        typeArguments.push(pool1Args[1], pool1Args[2], pool1Args[0]);
      }

      typeArguments.push(pool2Args[2], coinTypeB);
      if (normalizeStructTag(coinTypeB) === normalizeStructTag(pool2Args[0])) {
        functionName.push('c', 'b');
      } else {
        functionName.push('b', 'c');
      }
    }

    return {
      functionName: functionName.join('_'),
      typeArguments,
    };
  }

  amountOutWithSlippage(
    amountOut: Decimal,
    slippage: string,
    amountSpecifiedIsInput: boolean,
  ) {
    if (amountSpecifiedIsInput) {
      const minus = new Decimal(100).minus(slippage).div(100);
      return new Decimal(amountOut).mul(minus).toFixed(0);
    }

    const plus = new Decimal(100).plus(slippage).div(100);
    return new Decimal(amountOut).mul(plus).toFixed(0);
  }

  getDefaultSqrtPriceLimit(a2b: boolean) {
    return a2b ? MIN_SQRT_PRICE : MAX_SQRT_PRICE;
  }

  sqrtPriceWithSlippage(
    price: Decimal,
    slippage: string,
    a2b: boolean,
    decimalsA: number,
    decimalsB: number,
  ): string {
    const newPrice = new Decimal(price).mul(
      a2b
        ? new Decimal(100).minus(slippage).div(100)
        : new Decimal(100).plus(slippage).div(100),
    );
    const sqrtPrice = this.math.priceToSqrtPriceX64(newPrice, decimalsA, decimalsB);

    if (sqrtPrice.lt(new BN(MIN_SQRT_PRICE))) {
      return MIN_SQRT_PRICE;
    }
    if (sqrtPrice.gt(new BN(MAX_SQRT_PRICE))) {
      return MAX_SQRT_PRICE;
    }
    return sqrtPrice.toString();
  }
}
