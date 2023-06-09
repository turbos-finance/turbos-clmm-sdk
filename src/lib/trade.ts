import { SUI_CLOCK_OBJECT_ID, SuiAddress, TransactionBlock } from '@mysten/sui.js';
import { Base } from './base';
import Decimal from 'decimal.js';
import { Pool } from './pool';
import {
  MIN_TICK_INDEX,
  MAX_TICK_INDEX,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
} from '../constants';
import { BN } from 'bn.js';

const ONE_MINUTE = 60 * 1000;

export declare module Trade {
  export interface SwapOptions {
    routes: { pool: string; aToB: boolean; nextTickIndex: number }[];
    coinTypeA: string;
    coinTypeB: string;
    address: SuiAddress;
    amountIn: Decimal.Value;
    amountOut: Decimal.Value;
    amountSpecifiedIsInput: boolean;
    slippage: string;
    txb?: TransactionBlock;
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
}

export class Trade extends Base {
  async swap(options: Trade.SwapOptions): Promise<TransactionBlock> {
    const { coinTypeA, coinTypeB, address, amountOut, amountSpecifiedIsInput, slippage } =
      options;
    const contract = await this.contract.getConfig();
    const amountIn = new Decimal(options.amountIn);
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
    const coinIds = await this.coin.selectTradeCoins(address, coinTypeA, amountIn);
    const { functionName, typeArguments } = this.getFunctionNameAndTypeArguments(
      routes.map(({ typeArguments }) => typeArguments),
      coinTypeA,
      coinTypeB,
    );

    const sqrtPrices = routes.map(async ({ nextTickIndex, coinA, coinB, aToB }) => {
      const nextTickPrice = this.math.tickIndexToPrice(
        nextTickIndex,
        coinA.decimals,
        coinB.decimals,
      );
      return this.sqrtPriceWithSlippage(
        nextTickPrice,
        slippage,
        aToB,
        coinA.decimals,
        coinB.decimals,
      );
    });

    const txb = options.txb || new TransactionBlock();
    txb.moveCall({
      target: `${contract.PackageId}::swap_router::${functionName}`,
      typeArguments: typeArguments,
      arguments: [
        ...routes.map(({ pool }) => txb.object(pool)),
        txb.makeMoveVec({
          objects: this.coin.convertTradeCoins(txb, coinIds, coinTypeA, amountIn),
        }),
        txb.pure(amountIn.toFixed(0), 'u64'),
        txb.pure(
          this.amountOutWithSlippage(amountOut, slippage, amountSpecifiedIsInput),
          'u64',
        ),
        ...sqrtPrices.map((price) => txb.pure(price, 'u128')),
        txb.pure(amountSpecifiedIsInput, 'bool'),
        txb.object(address),
        txb.pure(Date.now() + ONE_MINUTE * 3, 'u64'),
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async computeSwapResult(options: {
    pool: string;
    a2b: boolean;
    address: SuiAddress;
    amountSpecified: Decimal.Value;
    amountSpecifiedIsInput: boolean;
  }): Promise<Trade.ComputedSwapResult> {
    const { pool, a2b, amountSpecified, amountSpecifiedIsInput, address } = options;
    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool['getPoolTypeArguments'](pool);

    const txb = new TransactionBlock();
    txb.moveCall({
      target: `${contract.PackageId}::pool_fetcher::compute_swap_result`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // a_to_b
        txb.pure(a2b, 'bool'),
        // amount_specified
        txb.pure(new Decimal(amountSpecified).toFixed(0), 'u128'),
        // amount_specified_is_input
        txb.pure(amountSpecifiedIsInput, 'bool'),
        // sqrt_price_limit
        txb.pure(
          this.math
            .tickIndexToSqrtPriceX64(a2b ? MIN_TICK_INDEX : MAX_TICK_INDEX)
            .toString(),
          'u128',
        ),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });

    const result = await this.provider.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: address,
    });
    if (result.error) {
      throw new Error(result.error);
    }
    return result.events[0]!.parsedJson as Trade.ComputedSwapResult;
  }

  protected getFunctionNameAndTypeArguments(
    pools: Pool.Types[],
    coinTypeA: string,
    coinTypeB: string,
  ) {
    let typeArguments: string[];
    const functionName: string[] = ['swap'];
    if (pools.length === 1) {
      typeArguments = pools[0]!;
      if (coinTypeA === typeArguments[0]) {
        functionName.push('a', 'b');
      } else {
        functionName.push('b', 'a');
      }
    } else {
      const pool1Args = pools[0]!;
      const pool2Args = pools[1]!;
      let coinTypeC: string;
      if (coinTypeA === pool1Args[0]) {
        functionName.push('a', 'b');
        coinTypeC = pool1Args[1];
      } else {
        functionName.push('b', 'a');
        coinTypeC = pool1Args[0];
      }
      if (coinTypeB === pool2Args[0]) {
        functionName.push('c', 'b');
      } else {
        functionName.push('b', 'c');
      }
      typeArguments = [coinTypeA, pool1Args[2], coinTypeB, pool2Args[2], coinTypeC];
    }

    return {
      functionName: functionName.join('_'),
      typeArguments,
    };
  }

  protected amountOutWithSlippage(
    amountOut: Decimal.Value,
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

  protected sqrtPriceWithSlippage(
    price: Decimal.Value,
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
