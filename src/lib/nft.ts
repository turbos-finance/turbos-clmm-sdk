import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { Base } from './base';
import BN from 'bn.js';
import { parseObjectFields, type CoreObjectWithContent } from './legacy';
import {
  Position as PositionBcs,
  TurbosPositionNFT,
  I32,
  Tick,
  type PositionFields as PositionBcsFields,
  type TurbosPositionNFTFields,
} from '../bcs/clmm';
import Decimal from 'decimal.js';
import { collectFeesQuote } from '../utils/collect-fees-quote';
import { collectRewardsQuote } from '../utils/collect-rewards-quote';
import type { Pool } from './pool';

/**
 * @deprecated use Position instead
 */
export declare namespace Position {
  export interface PositionNftField extends TurbosPositionNFTFields {}

  export interface PositionField extends PositionBcsFields {}

  export interface PositionTickField {
    id: string;
    name: { bits: number };
    value: {
      fee_growth_outside_a: string;
      fee_growth_outside_b: string;
      id: string;
      initialized: boolean;
      liquidity_gross: string;
      liquidity_net: { bits: string };
      reward_growths_outside: [string, string, string];
    };
  }

  export interface PositionTick {
    tickIndex: number;
    initialized: boolean;
    liquidityNet: BN;
    liquidityGross: BN;
    feeGrowthOutsideA: BN;
    feeGrowthOutsideB: BN;
    rewardGrowthsOutside: [BN, BN, BN];
  }

  export interface BurnOptions {
    pool: string;
    nft: string;
    txb?: Transaction;
  }

  export interface UnclaimedFeesAndRewardsResult {
    fees: string;
    rewards: string;
    total: string;
    fields: {
      collectRewards: [string, string, string];
      scaledCollectRewards: [string, string, string];
      feeOwedA: string;
      feeOwedB: string;
      scaledFeeOwedA: string;
      scaledFeeOwedB: string;
    };
  }

  export interface UnclaimedFeesResult {
    feeOwedA: string;
    feeOwedB: string;
    unclaimedFees: Decimal;
    scaledFeeOwedA: string;
    scaledFeeOwedB: string;
  }

  export interface UnclaimedRewardsResult {
    unclaimedRewards: Decimal;
    collectRewards: [string, string, string];
    scaledCollectRewards: [string, string, string];
  }
}

/**
 * @deprecated use Position instead
 */
export class Position extends Base {
  async getOwner(nftId: string) {
    const result = await this.getObject(nftId);
    const owner = result.owner;
    if (!owner || typeof owner === 'string') return void 0;
    if ('ObjectOwner' in owner) return owner.ObjectOwner;
    if ('AddressOwner' in owner) return owner.AddressOwner;
    return void 0;
  }

  async getFields(nftId: string): Promise<Position.PositionNftField> {
    const result = await this.getObject(nftId);
    return parseObjectFields(result, TurbosPositionNFT);
  }

  async getPositionFields(nftId: string): Promise<Position.PositionField> {
    const contract = await this.contract.getConfig();
    // Positions are attached via dof::add, so on-chain the key is wrapped in
    // 0x2::dynamic_object_field::Wrapper<address>. The wrapped type must be used to
    // derive the correct fieldId (Wrapper is transparent — bcs is still the inner K's bcs).
    const { dynamicField } = await this.provider.core.getDynamicField({
      parentId: contract.Positions,
      name: {
        type: '0x2::dynamic_object_field::Wrapper<address>',
        bcs: bcs.Address.serialize(nftId).toBytes(),
      },
    });
    if (dynamicField.$kind !== 'DynamicObject') {
      throw new Error(`Position for nft(${nftId}) is not found`);
    }
    return this.getPositionFieldsByPositionId(dynamicField.childId);
  }

  async getPositionFieldsByPositionId(
    positionId: string,
  ): Promise<Position.PositionField> {
    const { object } = await this.provider.core.getObject({
      objectId: positionId,
      include: { content: true },
    });
    return parseObjectFields(object, PositionBcs);
  }

  async getPositionTick(
    pool: string,
    tickIndex:
      | Position.PositionField['tick_lower_index']
      | Position.PositionField['tick_upper_index'],
  ): Promise<Position.PositionTick | undefined> {
    const contract = await this.contract.getConfig();
    let response;
    try {
      response = await this.provider.core.getDynamicField({
        parentId: pool,
        name: {
          type: `${contract.PackageIdOriginal}::i32::I32`,
          bcs: I32.serialize({ bits: tickIndex.bits }).toBytes(),
        },
      });
    } catch {
      return;
    }
    const tick = Tick.parse(response.dynamicField.value.bcs);

    return {
      tickIndex: this.math.bitsToNumber(tickIndex.bits),
      initialized: tick.initialized,
      liquidityNet: new BN(
        this.math.bitsToNumber(tick.liquidity_net.bits, 128).toString(),
      ),
      liquidityGross: new BN(tick.liquidity_gross),
      feeGrowthOutsideA: new BN(tick.fee_growth_outside_a),
      feeGrowthOutsideB: new BN(tick.fee_growth_outside_b),
      rewardGrowthsOutside: tick.reward_growths_outside.map((val) => new BN(val)) as [
        BN,
        BN,
        BN,
      ],
    };
  }

  async getPositionAPR(opts: {
    poolId: string;
    tickLower: number;
    tickUpper: number;
    fees24h: string | number;
    getPrice(coinType: string): Promise<string | number | undefined>;
    liquidity?: string;
  }): Promise<{ fees: string; total: string; rewards: string }> {
    const { poolId, getPrice, fees24h, tickLower, tickUpper, liquidity } = opts;
    const pool = await this.pool.getPool(poolId);
    const tickCurrent = this.math.bitsToNumber(pool.tick_current_index.bits);
    const [coinA, coinB, priceA, priceB] = await Promise.all([
      this.coin.getMetadata(pool.types[0]),
      this.coin.getMetadata(pool.types[1]),
      getPrice(pool.types[0]),
      getPrice(pool.types[1]),
    ]);

    if (
      !priceA ||
      !priceB ||
      tickLower >= tickUpper ||
      tickCurrent < tickLower ||
      tickCurrent >= tickUpper
    ) {
      return { fees: '0', rewards: '0', total: '0' };
    }

    const { minTokenA, minTokenB } = this.getRemoveLiquidityQuote(
      {
        ...pool,
        liquidity: liquidity || pool.liquidity,
      },
      tickLower,
      tickUpper,
    );
    const tokenValueA = new Decimal(
      this.math.scaleDown(minTokenA.toString(), coinA.decimals),
    ).mul(priceA);
    const tokenValueB = new Decimal(
      this.math.scaleDown(minTokenB.toString(), coinB.decimals),
    ).mul(priceB);
    const concentratedValue = tokenValueA.add(tokenValueB);

    const feeApr = concentratedValue.isZero()
      ? new Decimal(0)
      : new Decimal(fees24h).mul(365).div(concentratedValue).mul(100);
    let totalRewardApr = new Decimal(0);

    await Promise.all(
      pool.reward_infos.map(async (reward) => {
        const { emissions_per_second } = reward;
        const coinType = this.coin.formatCoinType(reward.vault_coin_type);
        const [price, coin] = await Promise.all([
          getPrice(coinType),
          this.coin.getMetadata(coinType),
        ]);
        if (!emissions_per_second || emissions_per_second === '0' || !price) return;

        totalRewardApr = totalRewardApr.add(
          new Decimal(new BN(emissions_per_second).shrn(64).toString())
            .div(10 ** coin.decimals)
            .mul(31_536_000 /* seconds per year */)
            .mul(price)
            .div(concentratedValue)
            .mul(100),
        );
      }),
    );

    return {
      fees: feeApr.toString(),
      rewards: totalRewardApr.toString(),
      total: feeApr.plus(totalRewardApr).toString(),
    };
  }

  protected getRemoveLiquidityQuote(
    pool: Pool.PoolFields,
    tickLower: number,
    tickUpper: number,
  ): { minTokenA: BN; minTokenB: BN } {
    const ZERO = new BN(0);
    const liquidity = new BN(pool.liquidity);
    const tickCurrent = this.math.bitsToNumber(pool.tick_current_index.bits);
    const sqrtPriceLowerX64 = this.math.tickIndexToSqrtPriceX64(tickLower);
    const sqrtPriceUpperX64 = this.math.tickIndexToSqrtPriceX64(tickUpper);

    if (tickCurrent < tickLower) {
      const estTokenA = this.getTokenAFromLiquidity(
        liquidity,
        sqrtPriceLowerX64,
        sqrtPriceUpperX64,
      );
      return { minTokenA: this.adjustForSlippage(estTokenA), minTokenB: ZERO };
    }

    if (tickCurrent < tickUpper) {
      const sqrtPriceX64 = new BN(pool.sqrt_price);
      const estTokenA = this.getTokenAFromLiquidity(
        liquidity,
        sqrtPriceX64,
        sqrtPriceUpperX64,
      );
      const estTokenB = this.getTokenBFromLiquidity(
        liquidity,
        sqrtPriceLowerX64,
        sqrtPriceX64,
      );
      return {
        minTokenA: this.adjustForSlippage(estTokenA),
        minTokenB: this.adjustForSlippage(estTokenB),
      };
    }

    const estTokenB = this.getTokenBFromLiquidity(
      liquidity,
      sqrtPriceLowerX64,
      sqrtPriceUpperX64,
    );
    return { minTokenA: ZERO, minTokenB: this.adjustForSlippage(estTokenB) };
  }

  protected adjustForSlippage(n: BN): BN {
    const slippageTolerance = {
      numerator: new BN(0),
      denominator: new BN(1000),
    };
    return n
      .mul(slippageTolerance.denominator)
      .div(slippageTolerance.denominator.add(slippageTolerance.numerator));
  }

  protected getTokenAFromLiquidity(
    liquidity: BN,
    sqrtPriceLowerX64: BN,
    sqrtPriceUpperX64: BN,
  ) {
    const numerator = liquidity.mul(sqrtPriceUpperX64.sub(sqrtPriceLowerX64)).shln(64);
    const denominator = sqrtPriceUpperX64.mul(sqrtPriceLowerX64);
    return numerator.div(denominator);
  }

  protected getTokenBFromLiquidity(
    liquidity: BN,
    sqrtPriceLowerX64: BN,
    sqrtPriceUpperX64: BN,
  ) {
    return liquidity.mul(sqrtPriceUpperX64.sub(sqrtPriceLowerX64)).shrn(64);
  }

  async burn(options: Position.BurnOptions): Promise<Transaction> {
    const { pool, nft } = options;
    const txb = options.txb || new Transaction();
    const contract = await this.contract.getConfig();
    const typeArguments = await this.pool.getPoolTypeArguments(pool);

    txb.moveCall({
      target: `${contract.PackageId}::position_manager::burn`,
      typeArguments: typeArguments,
      arguments: [
        txb.object(contract.Positions),
        txb.object(nft),
        txb.object(contract.Versioned),
      ],
    });

    return txb;
  }

  async getPositionLiquidityUSD(options: {
    poolId: string;
    position: Position.PositionField;
    priceA: string | number | undefined;
    priceB: string | number | undefined;
  }) {
    const { position, poolId, priceA, priceB } = options;
    const pool = await this.pool.getPool(poolId);
    const amount = this.pool.getTokenAmountsFromLiquidity({
      currentSqrtPrice: new BN(pool.sqrt_price),
      lowerSqrtPrice: this.math.tickIndexToSqrtPriceX64(
        this.math.bitsToNumber(position.tick_lower_index.bits),
      ),
      upperSqrtPrice: this.math.tickIndexToSqrtPriceX64(
        this.math.bitsToNumber(position.tick_upper_index.bits),
      ),
      liquidity: new BN(
        position.liquidity === undefined ? 100_000_000 : position.liquidity,
      ),
    });

    const [coin_a, coin_b] = await Promise.all([
      this.coin.getMetadata(pool.types[0]),
      this.coin.getMetadata(pool.types[1]),
    ]);

    const liquidityAUsd = new Decimal(amount[0].toString())
      .div(10 ** coin_a.decimals)
      .mul(priceA || 0);
    const liquidityBUsd = new Decimal(amount[1].toString())
      .div(10 ** coin_b.decimals)
      .mul(priceB || 0);
    return liquidityAUsd.plus(liquidityBUsd).toString();
  }

  async getUnclaimedFeesAndRewards(options: {
    poolId: string;
    position: Position.PositionField;
    getPrice(coinType: string): Promise<string | number | undefined>;
  }): Promise<Position.UnclaimedFeesAndRewardsResult> {
    const { position, poolId } = options;
    const [pool, tickLowerDetail, tickUpperDetail] = await Promise.all([
      this.pool.getPool(poolId),
      this.getPositionTick(poolId, position.tick_lower_index),
      this.getPositionTick(poolId, position.tick_upper_index),
    ]);
    const opts = {
      ...options,
      pool,
      tickLowerDetail: tickLowerDetail!,
      tickUpperDetail: tickUpperDetail!,
    };
    const [fees, rewards] = await Promise.all([
      this.getUnclaimedFees(opts),
      this.getUnclaimedRewards(opts),
    ]);

    const { unclaimedFees, ...restFees } = fees;
    const { unclaimedRewards, ...restRewards } = rewards;

    return {
      fees: fees.unclaimedFees.toString(),
      rewards: unclaimedRewards.toString(),
      total: unclaimedFees.plus(unclaimedRewards).toString(),
      fields: {
        ...restFees,
        ...restRewards,
      },
    };
  }

  async getUnclaimedFees(options: {
    pool: Pool.Pool;
    position: Position.PositionField;
    /**
     * Returning field `unclaimedFees` is based on price
     */
    getPrice?(coinType: string): Promise<string | number | undefined>;
    tickLowerDetail: Position.PositionTick;
    tickUpperDetail: Position.PositionTick;
  }): Promise<Position.UnclaimedFeesResult> {
    const { position, pool, getPrice, tickLowerDetail, tickUpperDetail } = options;
    const [coinA, coinB, priceA, priceB] = await Promise.all([
      this.coin.getMetadata(pool.types[0]),
      this.coin.getMetadata(pool.types[1]),
      getPrice?.(pool.types[0]),
      getPrice?.(pool.types[1]),
    ]);
    const collectFees = collectFeesQuote(this.math, {
      pool,
      position,
      tickLowerDetail: tickLowerDetail!,
      tickUpperDetail: tickUpperDetail!,
    });
    let scaledFeeOwedA = this.math.scaleDown(collectFees.feeOwedA, coinA.decimals);
    let scaledFeeOwedB = this.math.scaleDown(collectFees.feeOwedB, coinB.decimals);

    // function isTooLarge(value: string, decimals: number) {
    //   const max = new Decimal(1_000_000).mul(Decimal.pow(10, decimals));
    //   return max.lt(value);
    // }

    // if (isTooLarge(scaledFeeOwedA, coinA.decimals)) {
    //   scaledFeeOwedA = '0';
    //   collectFees.feeOwedA = '0';
    // }
    // if (isTooLarge(scaledFeeOwedB, coinB.decimals)) {
    //   scaledFeeOwedB = '0';
    //   collectFees.feeOwedB = '0';
    // }

    const unclaimedFeeA =
      priceA === void 0 ? new Decimal(0) : new Decimal(priceA).mul(scaledFeeOwedA);
    const unclaimedFeeB =
      priceB === void 0 ? new Decimal(0) : new Decimal(priceB).mul(scaledFeeOwedB);

    return {
      unclaimedFees: unclaimedFeeA.plus(unclaimedFeeB),
      scaledFeeOwedA,
      scaledFeeOwedB,
      ...collectFees,
    };
  }

  async getUnclaimedRewards(options: {
    pool: Pool.Pool;
    position: Position.PositionField;
    /**
     * Returning field `unclaimedRewards` is based on price
     */
    getPrice?(coinType: string): Promise<string | number | undefined>;
    tickLowerDetail: Position.PositionTick;
    tickUpperDetail: Position.PositionTick;
  }): Promise<Position.UnclaimedRewardsResult> {
    const { position, pool, getPrice, tickLowerDetail, tickUpperDetail } = options;

    const collectRewards = collectRewardsQuote(this.math, {
      pool,
      position,
      tickLowerDetail: tickLowerDetail!,
      tickUpperDetail: tickUpperDetail!,
    });
    const scaledCollectRewards = [...collectRewards] as typeof collectRewards;
    const coinTypes = pool.reward_infos.map((reward) =>
      this.coin.formatCoinType(reward.vault_coin_type),
    );
    const coins = await Promise.all([
      ...pool.reward_infos.map((_, index) => {
        return this.coin.getMetadata(coinTypes[index]!);
      }),
    ]);
    const prices = await Promise.all(
      pool.reward_infos.map((_, index) => {
        return getPrice?.(coinTypes[index]!);
      }),
    );
    coins.forEach((coin, index) => {
      scaledCollectRewards[index] = this.math.scaleDown(
        scaledCollectRewards[index]!,
        coin.decimals,
      );
    });
    let unclaimedRewards = new Decimal(0);
    pool.reward_infos.some((_, index) => {
      const price = prices[index];
      if (price) {
        unclaimedRewards = unclaimedRewards.plus(
          new Decimal(price).mul(scaledCollectRewards[index]!),
        );
        return false;
      } else {
        unclaimedRewards = unclaimedRewards.plus(1);
        return true;
      }
    });

    return {
      unclaimedRewards,
      collectRewards,
      scaledCollectRewards,
    };
  }

  protected getObject(nftId: string): Promise<CoreObjectWithContent> {
    return this.getCacheOrSet('nft-object-' + nftId, async () => {
      const { object } = await this.provider.core.getObject({
        objectId: nftId,
        include: { content: true },
      });
      return object;
    });
  }
}
