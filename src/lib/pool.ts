import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import {
  // coinWithBalance,
  Transaction,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import Decimal from 'decimal.js';
import { Contract } from './contract';
import { validateObjectResponse } from '../utils/validate-object-response';
import { Base } from './base';
import BN from 'bn.js';
import type { DynamicFieldPage, SuiObjectResponse } from '@mysten/sui/client';
import { getObjectFields, getObjectId, getObjectType } from './legacy';
import * as suiKit from '../utils/sui-kit';
import { deprecatedPoolRewards } from '../utils/deprecated-pool-rewards';

const ONE_MINUTE = 60 * 1000;

export declare module Pool {
  export interface MintParams {
    /**
     * Pool ID
     */
    pool: string;
    address: string;
    amountA: string | number;
    amountB: string | number;
    /**
     * Acceptable wasted amount. Range: `[0, 100)`, unit: `%`
     */
    slippage: string | number;
    deadline?: number;
    txb?: Transaction;
  }

  export interface LiquidityParams {
    tickLower: number;
    tickUpper: number;
  }

  export interface CreatePoolOptions extends Omit<MintParams, 'pool'>, LiquidityParams {
    /**
     * Fee object from `sdk.contract.getFees()`
     */
    fee: Contract.Fee;
    /**
     * Coin type such as `0x2::sui::SUI`
     */
    coinTypeA: string;
    coinTypeB: string;
    sqrtPrice: string;
  }

  export interface CoinObjectArguments {
    coinAObjectArguments?: TransactionObjectArgument[];
    coinBObjectArguments?: TransactionObjectArgument[];
  }

  export interface AddLiquidityOptions
    extends MintParams,
      LiquidityParams,
      CoinObjectArguments {}

  export interface AddLiquidityByAmountObjectOptions extends AddLiquidityOptions {
    amountAObject?: TransactionObjectArgument;
    amountBObject?: TransactionObjectArgument;
  }

  export interface IncreaseLiquidityOptions extends MintParams, CoinObjectArguments {
    /**
     * NFT ID
     */
    nft: string;
  }

  export interface IncreaseLiquidityByAmountObjectOptions
    extends IncreaseLiquidityOptions {
    amountAObject?: TransactionObjectArgument;
    amountBObject?: TransactionObjectArgument;
  }

  export interface DecreaseLiquidityOptions extends MintParams {
    /**
     * NFT ID
     */
    nft: string;
    decreaseLiquidity: string | number;
  }

  export interface RemoveLiquidityOptions
    extends DecreaseLiquidityOptions,
      CollectFeeOptions,
      CollectRewardOptions {}

  export interface CollectFeeOptions
    extends Pick<Pool.MintParams, 'pool' | 'txb' | 'address' | 'deadline'> {
    /**
     * NFT ID
     */
    nft: string;
    collectAmountA: string | number;
    collectAmountB: string | number;
  }

  export interface CollectRewardOptions
    extends Pick<Pool.MintParams, 'pool' | 'txb' | 'address' | 'deadline'> {
    /**
     * NFT ID
     */
    nft: string;
    rewardAmounts: (string | number)[];
  }

  /**
   * Pool fields from `provider.getObject()` while turning on `showContent` option.
   */
  export interface PoolFields {
    coin_a: string;
    coin_b: string;
    deploy_time_ms: string;
    fee: number;
    fee_growth_global_a: string;
    fee_growth_global_b: string;
    fee_protocol: number;
    id: { id: string };
    liquidity: string;
    max_liquidity_per_tick: string;
    protocol_fees_a: string;
    protocol_fees_b: string;
    reward_infos: {
      type: string;
      fields: {
        emissions_per_second: string;
        growth_global: string;
        id: {
          id: string;
        };
        manager: string;
        vault: string;
        vault_coin_type: string;
      };
    }[];
    reward_last_updated_time_ms: string;
    sqrt_price: string;
    tick_current_index: {
      type: string;
      fields: { bits: number };
    };
    tick_map: {
      type: string;
      fields: {
        id: { id: string };
        size: string;
      };
    };
    tick_spacing: number;
    unlocked: boolean;
  }

  export type Types = [string, string, string];

  export interface Pool extends PoolFields {
    objectId: string;
    type: string;
    types: Types;
  }
}

export class Pool extends Base {
  /**
   * Get Turbos unlocked pools
   * @param withLocked Defaults `false`
   */
  async getPools(withLocked: boolean = false): Promise<Pool.Pool[]> {
    const contract = await this.contract.getConfig();
    const poolFactoryIds: string[] = [];
    let poolFactories!: DynamicFieldPage;
    do {
      poolFactories = await this.provider.getDynamicFields({
        parentId: contract.PoolTableId,
        cursor: poolFactories?.nextCursor,
      });
      poolFactoryIds.push(...poolFactories.data.map((factory) => factory.objectId));
    } while (poolFactories.hasNextPage);

    if (!poolFactoryIds.length) return [];
    const poolFactoryInfos = await suiKit.multiGetObjects(this.provider, poolFactoryIds, {
      showContent: true,
    });
    const poolIds = poolFactoryInfos.map((info) => {
      const fields = getObjectFields(info) as {
        value: {
          fields: {
            pool_id: string;
            pool_key: string;
          };
        };
      };
      return fields.value.fields.pool_id;
    });

    if (!poolIds.length) return [];
    let pools = await suiKit.multiGetObjects(this.provider, poolIds, {
      showContent: true,
    });
    if (!withLocked) {
      pools = pools.filter((pool) => {
        const fields = getObjectFields(pool) as unknown as Pool.PoolFields;
        return fields.unlocked;
      });
    }

    return pools.map((pool) => this.parsePool(pool));
  }

  async getPool(poolId: string) {
    return this.getCacheOrSet(
      `pool-${poolId}`,
      async () => {
        const result = await this.provider.getObject({
          id: poolId,
          options: { showContent: true },
        });
        validateObjectResponse(result, 'pool');
        return this.parsePool(result);
      },
      1500,
    );
  }

  async createPool(options: Pool.CreatePoolOptions): Promise<Transaction> {
    const {
      fee,
      address,
      tickLower,
      tickUpper,
      sqrtPrice,
      slippage,
      coinTypeA,
      coinTypeB,
    } = options;
    const contract = await this.contract.getConfig();
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const [coinIdsA, coinIdsB] = await Promise.all([
      this.coin.selectTradeCoins(address, coinTypeA, amountA),
      this.coin.selectTradeCoins(address, coinTypeB, amountB),
    ]);

    const txb = options.txb || new Transaction();
    const coinAObjects =
      coinIdsA.length > 0
        ? this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA)
        : [this.coin.zero(coinTypeA, txb)];
    const coinBObjects =
      coinIdsB.length > 0
        ? this.coin.convertTradeCoins(txb, coinIdsB, coinTypeB, amountB)
        : [this.coin.zero(coinTypeB, txb)];

    txb.moveCall({
      target: `${contract.PackageId}::pool_factory::deploy_pool_and_mint`,
      typeArguments: [coinTypeA, coinTypeB, fee.type],
      arguments: [
        // pool_config
        txb.object(contract.PoolConfig),
        // fee_type?
        txb.object(fee.objectId),
        // sqrt_price
        txb.pure.u128(sqrtPrice),
        // positions
        txb.object(contract.Positions),
        // coins
        txb.makeMoveVec({
          elements: coinAObjects,
        }),
        txb.makeMoveVec({
          elements: coinBObjects,
        }),
        // tick_lower_index
        txb.pure.u32(Number(Math.abs(tickLower).toFixed(0))),
        txb.pure.bool(tickLower < 0),
        // tick_upper_index
        txb.pure.u32(Number(Math.abs(tickUpper).toFixed(0))),
        txb.pure.bool(tickUpper < 0),
        // amount_desired
        txb.pure.u64(amountA.toFixed(0)),
        txb.pure.u64(amountB.toFixed(0)),
        // amount_min
        txb.pure.u64(this.getMinimumAmountBySlippage(amountA, slippage)),
        txb.pure.u64(this.getMinimumAmountBySlippage(amountB, slippage)),
        // recipient
        txb.pure.address(address),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  estimateAmountsFromOneAmount(options: {
    sqrtPrice: string;
    tickLower: number;
    tickUpper: number;
    amount: string;
    isAmountA: boolean;
  }): [string, string] {
    const fixedAmount = new Decimal(options.amount).floor();
    const initialAmounts = this.getTokenAmountsFromLiquidity({
      liquidity: new BN(100_000_000),
      currentSqrtPrice: new BN(options.sqrtPrice),
      lowerSqrtPrice: this.math.tickIndexToSqrtPriceX64(options.tickLower),
      upperSqrtPrice: this.math.tickIndexToSqrtPriceX64(options.tickUpper),
    });

    if (initialAmounts[0].isZero()) {
      return options.isAmountA ? ['0', '0'] : ['0', fixedAmount.toString()];
    }

    if (initialAmounts[1].isZero()) {
      return options.isAmountA ? [fixedAmount.toString(), '0'] : ['0', '0'];
    }

    const ratio = new Decimal(initialAmounts[0].toString()).div(
      initialAmounts[1].toString(),
    );
    return options.isAmountA
      ? [fixedAmount.toString(), fixedAmount.div(ratio).toFixed(0)]
      : [fixedAmount.mul(ratio).toFixed(0), fixedAmount.toString()];
  }

  async addLiquidity(options: Pool.AddLiquidityOptions): Promise<Transaction> {
    const {
      address,
      tickLower,
      tickUpper,
      slippage,
      pool,
      coinAObjectArguments,
      coinBObjectArguments,
    } = options;

    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(pool);
    const [coinTypeA, coinTypeB] = typeArguments;
    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(coinTypeA),
      this.coin.getMetadata(coinTypeB),
    ]);
    if (!coinA || !coinB) throw new Error('Invalid coin type');
    const txb = options.txb || new Transaction();

    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);

    // txb.setSenderIfNotSet(address);
    // const coinAObjects = coinAObjectArguments
    //   ? coinAObjectArguments
    //   : [
    //       amountA.eq(0)
    //         ? this.coin.zero(coinTypeA, txb)
    //         : coinWithBalance({ type: coinTypeA, balance: Number(amountA.toString()) }),
    //     ];

    // const coinBObjects = coinBObjectArguments
    //   ? coinBObjectArguments
    //   : [
    //       amountB.eq(0)
    //         ? this.coin.zero(coinTypeA, txb)
    //         : coinWithBalance({ type: coinTypeB, balance: Number(amountB.toString()) }),
    //     ];

    const [coinIdsA, coinIdsB] = await Promise.all([
      this.coin.selectTradeCoins(address, coinTypeA, amountA),
      this.coin.selectTradeCoins(address, coinTypeB, amountB),
    ]);

    const coinAObjects = coinAObjectArguments
      ? coinAObjectArguments
      : coinIdsA.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA)
      : [this.coin.zero(coinTypeA, txb)];

    const coinBObjects = coinBObjectArguments
      ? coinBObjectArguments
      : coinIdsB.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsB, coinTypeB, amountB)
      : [this.coin.zero(coinTypeB, txb)];

    txb.moveCall({
      target: `${contract.PackageId}::position_manager::mint`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.Positions),
        // coins
        txb.makeMoveVec({
          elements: coinAObjects,
        }),
        txb.makeMoveVec({
          elements: coinBObjects,
        }),
        // tick_lower_index
        txb.pure.u32(Number(Math.abs(tickLower).toFixed(0))),
        txb.pure.bool(tickLower < 0),
        // tick_upper_index
        txb.pure.u32(Number(Math.abs(tickUpper).toFixed(0))),
        txb.pure.bool(tickUpper < 0),
        // amount_desired
        txb.pure.u64(amountA.toFixed(0)),
        txb.pure.u64(amountB.toFixed(0)),
        // amount_min
        txb.pure.u64(this.getMinimumAmountBySlippage(amountA, slippage)),
        txb.pure.u64(this.getMinimumAmountBySlippage(amountB, slippage)),
        // recipient
        txb.pure.address(address),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }
  async addLiquidityByAmountObject(
    options: Pool.AddLiquidityByAmountObjectOptions,
  ): Promise<Transaction> {
    const {
      address,
      tickLower,
      tickUpper,
      slippage,
      pool,
      coinAObjectArguments,
      coinBObjectArguments,
      amountAObject,
      amountBObject,
    } = options;

    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(pool);
    const [coinTypeA, coinTypeB] = typeArguments;
    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(coinTypeA),
      this.coin.getMetadata(coinTypeB),
    ]);
    if (!coinA || !coinB) throw new Error('Invalid coin type');
    const txb = options.txb || new Transaction();

    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);

    const [coinIdsA, coinIdsB] = await Promise.all([
      this.coin.selectTradeCoins(address, coinTypeA, amountA),
      this.coin.selectTradeCoins(address, coinTypeB, amountB),
    ]);

    const coinAObjects = coinAObjectArguments
      ? coinAObjectArguments
      : coinIdsA.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA)
      : [this.coin.zero(coinTypeA, txb)];

    const coinBObjects = coinBObjectArguments
      ? coinBObjectArguments
      : coinIdsB.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsB, coinTypeB, amountB)
      : [this.coin.zero(coinTypeB, txb)];

    txb.moveCall({
      target: `${contract.PackageId}::position_manager::mint`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.Positions),
        // coins
        txb.makeMoveVec({
          elements: coinAObjects,
        }),
        txb.makeMoveVec({
          elements: coinBObjects,
        }),
        // tick_lower_index
        txb.pure.u32(Number(Math.abs(tickLower).toFixed(0))),
        txb.pure.bool(tickLower < 0),
        // tick_upper_index
        txb.pure.u32(Number(Math.abs(tickUpper).toFixed(0))),
        txb.pure.bool(tickUpper < 0),
        // amount_desired
        amountAObject || txb.pure.u64(amountA.toFixed(0)),
        amountBObject || txb.pure.u64(amountB.toFixed(0)),
        // amount_min
        txb.pure.u64(this.getMinimumAmountBySlippage(amountA, slippage)),
        txb.pure.u64(this.getMinimumAmountBySlippage(amountB, slippage)),
        // recipient
        txb.pure.address(address),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async increaseLiquidity(options: Pool.IncreaseLiquidityOptions): Promise<Transaction> {
    const { pool, slippage, address, nft, coinAObjectArguments, coinBObjectArguments } =
      options;
    const contract = await this.contract.getConfig();
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const typeArguments = await this.getPoolTypeArguments(pool);
    const [coinTypeA, coinTypeB] = typeArguments;

    const txb = options.txb || new Transaction();

    const [coinIdsA, coinIdsB] = await Promise.all([
      this.coin.selectTradeCoins(address, coinTypeA, amountA),
      this.coin.selectTradeCoins(address, coinTypeB, amountB),
    ]);

    const coinAObjects = coinAObjectArguments
      ? coinAObjectArguments
      : coinIdsA.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA)
      : [this.coin.zero(coinTypeA, txb)];

    const coinBObjects = coinBObjectArguments
      ? coinBObjectArguments
      : coinIdsB.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsB, coinTypeB, amountB)
      : [this.coin.zero(coinTypeB, txb)];

    txb.moveCall({
      target: `${contract.PackageId}::position_manager::increase_liquidity`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.Positions),
        // coins
        txb.makeMoveVec({
          elements: coinAObjects,
        }),
        txb.makeMoveVec({
          elements: coinBObjects,
        }),
        // nft
        txb.object(nft),
        // amount_desired
        txb.pure.u64(amountA.toFixed(0)),
        txb.pure.u64(amountB.toFixed(0)),
        // amount_min
        txb.pure.u64(this.getMinimumAmountBySlippage(amountA, slippage)),
        txb.pure.u64(this.getMinimumAmountBySlippage(amountB, slippage)),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });
    return txb;
  }

  async increaseLiquidityByAmountObject(
    options: Pool.IncreaseLiquidityByAmountObjectOptions,
  ): Promise<Transaction> {
    const {
      pool,
      slippage,
      address,
      nft,
      coinAObjectArguments,
      coinBObjectArguments,
      amountAObject,
      amountBObject,
    } = options;
    const contract = await this.contract.getConfig();
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const typeArguments = await this.getPoolTypeArguments(pool);
    const [coinTypeA, coinTypeB] = typeArguments;

    const txb = options.txb || new Transaction();

    const [coinIdsA, coinIdsB] = await Promise.all([
      this.coin.selectTradeCoins(address, coinTypeA, amountA),
      this.coin.selectTradeCoins(address, coinTypeB, amountB),
    ]);

    const coinAObjects = coinAObjectArguments
      ? coinAObjectArguments
      : coinIdsA.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA)
      : [this.coin.zero(coinTypeA, txb)];

    const coinBObjects = coinBObjectArguments
      ? coinBObjectArguments
      : coinIdsB.length > 0
      ? this.coin.convertTradeCoins(txb, coinIdsB, coinTypeB, amountB)
      : [this.coin.zero(coinTypeB, txb)];

    txb.moveCall({
      target: `${contract.PackageId}::position_manager::increase_liquidity`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.Positions),
        // coins
        txb.makeMoveVec({
          elements: coinAObjects,
        }),
        txb.makeMoveVec({
          elements: coinBObjects,
        }),
        // nft
        txb.object(nft),
        // amount_desired
        amountAObject || txb.pure.u64(amountA.toFixed(0)),
        amountBObject || txb.pure.u64(amountB.toFixed(0)),
        // amount_min
        txb.pure.u64(this.getMinimumAmountBySlippage(amountA, slippage)),
        txb.pure.u64(this.getMinimumAmountBySlippage(amountB, slippage)),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });
    return txb;
  }

  async decreaseLiquidity(options: Pool.DecreaseLiquidityOptions): Promise<Transaction> {
    const { slippage, nft, pool, decreaseLiquidity } = options;
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(pool);

    const txb = options.txb || new Transaction();
    txb.moveCall({
      target: `${contract.PackageId}::position_manager::decrease_liquidity`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.Positions),
        // nft
        txb.object(nft),
        // liquidity
        txb.pure.u128(new BN(decreaseLiquidity).toString()),
        // amount_min
        txb.pure.u64(this.getMinimumAmountBySlippage(amountA, slippage)),
        txb.pure.u64(this.getMinimumAmountBySlippage(amountB, slippage)),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });
    return txb;
  }

  async decreaseLiquidityWithReturn(options: Pool.DecreaseLiquidityOptions): Promise<{
    coinA?: TransactionObjectArgument;
    coinB?: TransactionObjectArgument;
    txb: Transaction;
  }> {
    const { slippage, nft, pool, decreaseLiquidity, address } = options;
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(pool);

    const txb = options.txb || new Transaction();
    const [coinA, coinB] = txb.moveCall({
      target: `${contract.PackageId}::position_manager::decrease_liquidity_with_return_`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.Positions),
        // nft
        txb.object(nft),
        // liquidity
        txb.pure.u128(new BN(decreaseLiquidity).toString()),
        // amount_min
        txb.pure.u64(this.getMinimumAmountBySlippage(amountA, slippage)),
        txb.pure.u64(this.getMinimumAmountBySlippage(amountB, slippage)),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });

    if (options.txb) {
      txb.transferObjects([coinA!, coinB!], address);
    }

    return {
      coinA,
      coinB,
      txb,
    };
  }

  async removeLiquidity(options: Pool.RemoveLiquidityOptions): Promise<Transaction> {
    let txb = await this.decreaseLiquidity(options);
    txb = await this.collectFee({ txb, ...options });
    txb = await this.collectReward({ txb, ...options });
    txb = await this.nft.burn({ txb, nft: options.nft, pool: options.pool });

    return txb;
  }

  async removeLiquidityWithReturn(options: Pool.RemoveLiquidityOptions): Promise<{
    coinA?: TransactionObjectArgument;
    coinB?: TransactionObjectArgument;
    txb: Transaction;
  }> {
    let { txb, coinA, coinB } = await this.decreaseLiquidityWithReturn(options);
    txb = await this.collectFee({ txb, ...options });
    txb = await this.collectReward({ txb, ...options });
    txb = await this.nft.burn({ txb, nft: options.nft, pool: options.pool });

    return {
      txb,
      coinA,
      coinB,
    };
  }

  async collectFee(options: Pool.CollectFeeOptions): Promise<Transaction> {
    const {
      pool,
      nft,
      address,
      collectAmountA: amountAMax,
      collectAmountB: amountBMax,
    } = options;
    const txb = options.txb || new Transaction();

    if (Number(amountAMax) === 0 && Number(amountBMax) === 0) {
      return txb;
    }

    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(pool);

    txb.moveCall({
      target: `${contract.PackageId}::position_manager::collect`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(pool),
        txb.object(contract.Positions),
        txb.object(nft),
        // amount_a_max
        txb.pure.u64(amountAMax),
        // amount_a_max
        txb.pure.u64(amountBMax),
        //recipient
        txb.pure.address(address),
        // deadline
        txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async collectReward(options: Pool.CollectRewardOptions): Promise<Transaction> {
    const { pool: poolId, nft, rewardAmounts, address } = options;
    const txb = options.txb || new Transaction();
    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(poolId);
    const pool = await this.getPool(poolId);

    pool.reward_infos.forEach((rewardInfo, index) => {
      if (
        rewardAmounts[index] !== '0' &&
        rewardAmounts[index] !== 0 &&
        !deprecatedPoolRewards(pool.id.id, index)
      ) {
        txb.moveCall({
          target: `${contract.PackageId}::position_manager::collect_reward`,
          typeArguments: [...typeArguments, rewardInfo.fields.vault_coin_type],
          arguments: [
            txb.object(poolId),
            txb.object(contract.Positions),
            txb.object(nft),
            txb.object(rewardInfo.fields.vault),
            txb.pure.u64(index),
            txb.pure.u64(rewardAmounts[index]!),
            txb.pure.address(address),
            txb.pure.u64(Date.now() + (options.deadline || ONE_MINUTE * 3)),
            txb.object(SUI_CLOCK_OBJECT_ID),
            txb.object(contract.Versioned),
          ],
        });
      }
    });

    return txb;
  }

  public getTokenAmountsFromLiquidity(options: {
    currentSqrtPrice: BN;
    lowerSqrtPrice: BN;
    upperSqrtPrice: BN;
    /**
     * Defaults `BN(100_000_000)`
     */
    liquidity?: BN;
    /**
     * Defaults `true`
     */
    ceil?: boolean;
  }): [a: BN, b: BN] {
    const liquidity = new Decimal((options.liquidity || new BN(100_000_000)).toString());
    const currentPrice = new Decimal(options.currentSqrtPrice.toString());
    const lowerPrice = new Decimal(options.lowerSqrtPrice.toString());
    const upperPrice = new Decimal(options.upperSqrtPrice.toString());
    let amountA: Decimal, amountB: Decimal;

    if (options.currentSqrtPrice.lt(options.lowerSqrtPrice)) {
      // x = L * (pb - pa) / (pa * pb)
      amountA = this.math
        .toX64_Decimal(liquidity)
        .mul(upperPrice.sub(lowerPrice))
        .div(lowerPrice.mul(upperPrice));
      amountB = new Decimal(0);
    } else if (options.currentSqrtPrice.lt(options.upperSqrtPrice)) {
      // x = L * (pb - p) / (p * pb)
      // y = L * (p - pa)
      amountA = this.math
        .toX64_Decimal(liquidity)
        .mul(upperPrice.sub(currentPrice))
        .div(currentPrice.mul(upperPrice));
      amountB = this.math.fromX64_Decimal(liquidity.mul(currentPrice.sub(lowerPrice)));
    } else {
      // y = L * (pb - pa)
      amountA = new Decimal(0);
      amountB = this.math.fromX64_Decimal(liquidity.mul(upperPrice.sub(lowerPrice)));
    }

    const methodName = options.ceil !== false ? 'ceil' : 'floor';
    return [
      new BN(amountA[methodName]().toString()),
      new BN(amountB[methodName]().toString()),
    ];
  }

  async getPoolTypeArguments(poolId: string): Promise<Pool.Types> {
    return this.getCacheOrSet('pool-types-' + poolId, async () => {
      const result = await this.getPool(poolId);
      return result.types;
    });
  }

  parsePoolType(type: string, length: 2): [string, string];
  parsePoolType(type: string, length: 3): Pool.Types;
  parsePoolType(type: string): string[];
  parsePoolType(type: string, length?: number): string[] {
    const types = type.replace('>', '').split('<')[1]?.split(/,\s*/) || [];

    if (length !== undefined && length !== types.length) {
      throw new Error('Invalid pool type');
    }

    return types;
  }

  /**
   * Calculate liquidity by given amount and price.
   * It's useful for increase liquidity or creating pool which includes increase liquidity.
   */
  async getFixedLiquidity(options: {
    coinTypeA: string;
    coinTypeB: string;
    amountA: string | number;
    amountB: string | number;
    priceA: string | number | undefined;
    priceB: string | number | undefined;
  }) {
    const { coinTypeA, coinTypeB, amountA, amountB } = options;
    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(coinTypeA),
      this.coin.getMetadata(coinTypeB),
    ]);

    const liquidityA = new Decimal(this.math.scaleDown(amountA, coinA.decimals)).mul(
      options.priceA ?? 1,
    );
    const liquidityB = new Decimal(this.math.scaleDown(amountB, coinB.decimals)).mul(
      options.priceB ?? 1,
    );
    return {
      liquidityA: liquidityA.toString(),
      liquidityB: liquidityB.toString(),
      liquidity: liquidityA.plus(liquidityB).toString(),
    };
  }

  async fetchTicks(poolId: string) {
    const typeArguments = await this.getPoolTypeArguments(poolId);
    const contract = await this.contract.getConfig();
    const ticks: {
      id: string;
      tick_index: number;
      liquidity_gross: string;
      liquidity_net: string;
      fee_growth_outside_a: string;
      fee_growth_outside_b: string;
      reward_growths_outside: [string, string, string];
      initialized: boolean;
    }[] = [];

    let start: number[] = [];
    // Warning: limit should less than 999 to against MEMORY_LIMIT_EXCEEDED error.
    const limit = 900;
    while (true) {
      const tx = new Transaction();
      tx.moveCall({
        target: `${contract.PackageId}::pool_fetcher::fetch_ticks`,
        typeArguments: typeArguments,
        arguments: [
          tx.object(poolId),
          tx.pure.vector('u32', start.map(Math.abs)),
          tx.pure.bool(start[0] === undefined ? true : start[0] < 0),
          tx.pure.u64(limit),
          tx.object(contract.Versioned),
        ],
      });

      const result = await this.provider.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      if (result.error) {
        throw new Error(`Get pool ${poolId} ticks with error: ${result.error}`);
      }

      const eventData = result.events[0]!.parsedJson as {
        ticks: {
          id: string;
          tick_index: { bits: number };
          liquidity_gross: string;
          liquidity_net: { bits: string };
          fee_growth_outside_a: string;
          fee_growth_outside_b: string;
          reward_growths_outside: [string, string, string];
          initialized: boolean;
        }[];
        next_cursor: null | {
          type: string;
          fields: { bits: number };
        };
      };

      for (const tick of eventData.ticks) {
        ticks.push({
          id: tick.id,
          tick_index: this.math.bitsToNumber(tick.tick_index.bits),
          initialized: tick.initialized,
          liquidity_net: this.math.bitsToNumber(tick.liquidity_net.bits, 128).toString(),
          liquidity_gross: tick.liquidity_gross,
          fee_growth_outside_a: tick.fee_growth_outside_a,
          fee_growth_outside_b: tick.fee_growth_outside_b,
          reward_growths_outside: tick.reward_growths_outside,
        });
      }

      if (!eventData.next_cursor) break;
      start = [this.math.bitsToNumber(eventData.next_cursor.fields.bits)];
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return ticks;
  }

  parsePool(pool: SuiObjectResponse): Pool.Pool {
    const fields = getObjectFields(pool) as unknown as Pool.PoolFields;
    const objectId = getObjectId(pool);
    const type = getObjectType(pool)!;
    const types = this.parsePoolType(type, 3);
    this.getCacheOrSet('pool-type-' + objectId, async () => types);

    return {
      ...fields,
      objectId,
      type,
      types,
    };
  }

  protected getMinimumAmountBySlippage(
    amount: Decimal.Value,
    slippage: Decimal.Value,
  ): string {
    const origin = new Decimal(amount);
    const ratio = new Decimal(1).minus(new Decimal(slippage).div(100));
    if (ratio.lte(0) || ratio.gt(1)) {
      throw new Error('invalid slippage range');
    }
    return origin.mul(ratio).toFixed(0);
  }
}
