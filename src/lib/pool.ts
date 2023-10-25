import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui.js/utils';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import Decimal from 'decimal.js';
import { Contract } from './contract';
import { validateObjectResponse } from '../utils/validate-object-response';
import { Base } from './base';
import BN from 'bn.js';
import type { DynamicFieldPage, SuiObjectResponse } from '@mysten/sui.js/client';
import { getObjectFields, getObjectId, getObjectType } from './legacy';

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
    txb?: TransactionBlock;
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

  export interface AddLiquidityOptions extends MintParams, LiquidityParams {}

  export interface IncreaseLiquidityOptions extends MintParams {
    /**
     * NFT ID
     */
    nft: string;
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
    extends Pick<Pool.MintParams, 'pool' | 'txb' | 'address'> {
    /**
     * NFT ID
     */
    nft: string;
    collectAmountA: string | number;
    collectAmountB: string | number;
  }

  export interface CollectRewardOptions
    extends Pick<Pool.MintParams, 'pool' | 'txb' | 'address'> {
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
        limit: 15,
      });
      poolFactoryIds.push(...poolFactories.data.map((factory) => factory.objectId));
    } while (poolFactories.hasNextPage);

    if (!poolFactoryIds.length) return [];
    const poolFactoryInfos = await this.provider.multiGetObjects({
      ids: poolFactoryIds,
      options: { showContent: true },
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
    let pools = await this.provider.multiGetObjects({
      ids: poolIds,
      options: { showContent: true },
    });

    if (!withLocked) {
      pools = pools.filter((pool) => {
        const fields = getObjectFields(pool) as Pool.PoolFields;
        return fields.unlocked;
      });
    }

    return pools.map((pool) => this.parsePool(pool));
  }

  async getPool(poolId: string) {
    return this.getCacheOrSet(
      'pool',
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

  async createPool(options: Pool.CreatePoolOptions): Promise<TransactionBlock> {
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

    const txb = options.txb || new TransactionBlock();
    txb.moveCall({
      target: `${contract.PackageId}::pool_factory::deploy_pool_and_mint`,
      typeArguments: [coinTypeA, coinTypeB, fee.type],
      arguments: [
        // pool_config
        txb.object(contract.PoolConfig),
        // fee_type?
        txb.object(fee.objectId),
        // sqrt_price
        txb.pure(sqrtPrice, 'u128'),
        // positions
        txb.object(contract.Positions),
        // coins
        txb.makeMoveVec({
          objects: this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA),
        }),
        txb.makeMoveVec({
          objects: this.coin.convertTradeCoins(txb, coinIdsB, coinTypeB, amountB),
        }),
        // tick_lower_index
        txb.pure(Math.abs(tickLower).toFixed(0), 'u32'),
        txb.pure(tickLower < 0, 'bool'),
        // tick_upper_index
        txb.pure(Math.abs(tickUpper).toFixed(0), 'u32'),
        txb.pure(tickUpper < 0, 'bool'),
        // amount_desired
        txb.pure(amountA.toFixed(0), 'u64'),
        txb.pure(amountB.toFixed(0), 'u64'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(amountA, slippage), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(amountB, slippage), 'u64'),
        // recipient
        txb.pure(address, 'address'),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async addLiquidity(options: Pool.AddLiquidityOptions): Promise<TransactionBlock> {
    const { address, tickLower, tickUpper, slippage, pool } = options;
    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(pool);
    const [coinTypeA, coinTypeB] = typeArguments;
    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(coinTypeA),
      this.coin.getMetadata(coinTypeB),
    ]);
    if (!coinA || !coinB) throw new Error('Invalid coin type');
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const [coinIdsA, coinIdsB] = await Promise.all([
      this.coin.selectTradeCoins(address, coinTypeA, amountA),
      this.coin.selectTradeCoins(address, coinTypeB, amountB),
    ]);

    const txb = options.txb || new TransactionBlock();

    const coinAObjects =
      coinIdsA.length > 0
        ? this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA)
        : [this.coin.zero(coinTypeA, txb)];
    const coinBObjects =
      coinIdsB.length > 0
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
          objects: coinAObjects,
        }),
        txb.makeMoveVec({
          objects: coinBObjects,
        }),
        // tick_lower_index
        txb.pure(Math.abs(tickLower).toFixed(0), 'u32'),
        txb.pure(tickLower < 0, 'bool'),
        // tick_upper_index
        txb.pure(Math.abs(tickUpper).toFixed(0), 'u32'),
        txb.pure(tickUpper < 0, 'bool'),
        // amount_desired
        txb.pure(amountA.toFixed(0), 'u64'),
        txb.pure(amountB.toFixed(0), 'u64'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(amountA, slippage), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(amountB, slippage), 'u64'),
        // recipient
        txb.pure(address, 'address'),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async increaseLiquidity(
    options: Pool.IncreaseLiquidityOptions,
  ): Promise<TransactionBlock> {
    const { pool, slippage, address, nft } = options;
    const contract = await this.contract.getConfig();
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const typeArguments = await this.getPoolTypeArguments(pool);
    const [coinTypeA, coinTypeB] = typeArguments;
    const [coinIdsA, coinIdsB] = await Promise.all([
      this.coin.selectTradeCoins(address, coinTypeA, amountA),
      this.coin.selectTradeCoins(address, coinTypeB, amountB),
    ]);

    const txb = options.txb || new TransactionBlock();
    const coinAObjects =
      coinIdsA.length > 0
        ? this.coin.convertTradeCoins(txb, coinIdsA, coinTypeA, amountA)
        : [this.coin.zero(coinTypeA, txb)];
    const coinBObjects =
      coinIdsB.length > 0
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
          objects: coinAObjects,
        }),
        txb.makeMoveVec({
          objects: coinBObjects,
        }),
        // nft
        txb.object(nft),
        // amount_desired
        txb.pure(amountA.toFixed(0), 'u64'),
        txb.pure(amountB.toFixed(0), 'u64'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(amountA, slippage), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(amountB, slippage), 'u64'),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE * 3, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });
    return txb;
  }

  async decreaseLiquidity(
    options: Pool.DecreaseLiquidityOptions,
  ): Promise<TransactionBlock> {
    const { slippage, nft, pool, decreaseLiquidity } = options;
    const amountA = new Decimal(options.amountA);
    const amountB = new Decimal(options.amountB);
    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(pool);

    const txb = options.txb || new TransactionBlock();
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
        txb.pure(new BN(decreaseLiquidity).toString(), 'u128'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(amountA, slippage), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(amountB, slippage), 'u64'),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE * 3, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        // versioned
        txb.object(contract.Versioned),
      ],
    });
    return txb;
  }

  async removeLiquidity(options: Pool.RemoveLiquidityOptions): Promise<TransactionBlock> {
    let txb = await this.decreaseLiquidity(options);
    txb = await this.collectFee({ txb, ...options });
    txb = await this.collectReward({ txb, ...options });
    txb = await this.nft.burn({ txb, nft: options.nft, pool: options.pool });

    return txb;
  }

  async collectFee(options: Pool.CollectFeeOptions): Promise<TransactionBlock> {
    const {
      pool,
      nft,
      address,
      collectAmountA: amountAMax,
      collectAmountB: amountBMax,
    } = options;
    const txb = options.txb || new TransactionBlock();

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
        txb.pure(amountAMax, 'u64'),
        // amount_a_max
        txb.pure(amountBMax, 'u64'),
        //recipient
        txb.pure(address),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE * 3, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async collectReward(options: Pool.CollectRewardOptions): Promise<TransactionBlock> {
    const { pool: poolId, nft, rewardAmounts, address } = options;
    const txb = options.txb || new TransactionBlock();
    const contract = await this.contract.getConfig();
    const typeArguments = await this.getPoolTypeArguments(poolId);
    const pool = await this.getPool(poolId);

    pool.reward_infos.forEach((rewardInfo, index) => {
      txb.moveCall({
        target: `${contract.PackageId}::position_manager::collect_reward`,
        typeArguments: [...typeArguments, rewardInfo.fields.vault_coin_type],
        arguments: [
          txb.object(poolId),
          txb.object(contract.Positions),
          txb.object(nft),
          txb.object(rewardInfo.fields.vault),
          txb.pure(index, 'u64'),
          txb.pure(rewardAmounts[index], 'u64'), //TODO
          txb.pure(address),
          txb.pure(Date.now() + ONE_MINUTE * 3, 'u64'),
          txb.object(SUI_CLOCK_OBJECT_ID),
          txb.object(contract.Versioned),
        ],
      });
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
    return this.getCacheOrSet('pool-type-' + poolId, async () => {
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

  async getFixedLiquidity(options: {
    poolId: string;
    priceA: string | undefined;
    priceB: string | undefined;
  }) {
    const pool = await this.getPool(options.poolId);
    const [coinA, coinB] = await Promise.all([
      this.coin.getMetadata(pool.types[0]),
      this.coin.getMetadata(pool.types[1]),
    ]);

    const liquidityA = new Decimal(this.math.scaleDown(pool.coin_a, coinA.decimals)).mul(
      options.priceA ?? 1,
    );
    const liquidityB = new Decimal(this.math.scaleDown(pool.coin_b, coinB.decimals)).mul(
      options.priceB ?? 1,
    );
    return liquidityA.plus(liquidityB);
  }

  protected parsePool(pool: SuiObjectResponse): Pool.Pool {
    const fields = pool as Pool.PoolFields;
    const objectId = getObjectId(pool);
    const type = getObjectType(pool)!;
    this.getCacheOrSet('pool-type-' + objectId, async () => type);
    return {
      ...fields,
      objectId,
      type,
      types: this.parsePoolType(type, 3),
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
