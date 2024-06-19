import { TransactionBlock } from '@mysten/sui.js/transactions';
import { validateObjectResponse } from '../utils/validate-object-response';
import { Base } from './base';
import BN from 'bn.js';
import { getObjectFields, getObjectOwner } from './legacy';
import type { SuiObjectResponse } from '@mysten/sui.js/client';
import Decimal from 'decimal.js';
import { collectFeesQuote } from '../utils/collect-fees-quote';
import { collectRewardsQuote } from '../utils/collect-rewards-quote';
import type { Pool } from './pool';

export declare module NFT {
  export interface NftField {
    description: string;
    id: { id: string };
    img_url: string;
    name: string;
    pool_id: string;
    position_id: string;
  }

  export interface PositionField {
    fee_growth_inside_a: string;
    fee_growth_inside_b: string;
    id: { id: string };
    liquidity: string;
    reward_infos: {
      type: string;
      fields: {
        amount_owed: string;
        reward_growth_inside: string;
      };
    }[];
    tick_lower_index: {
      type: string;
      fields: { bits: number };
    };
    tick_upper_index: {
      type: string;
      fields: { bits: number };
    };
    tokens_owed_a: string;
    tokens_owed_b: string;
  }

  export interface PositionTickField {
    id: { id: string };
    name: { type: string; fields: { bits: number } };
    value: {
      type: string;
      fields: {
        fee_growth_outside_a: string;
        fee_growth_outside_b: string;
        id: { id: string };
        initialized: boolean;
        liquidity_gross: string;
        liquidity_net: {
          fields: {
            bits: string;
          };
          type: string;
        };
        reward_growths_outside: [string, string, string];
      };
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
    txb?: TransactionBlock;
  }
}

export class NFT extends Base {
  async getOwner(nftId: string) {
    const result = await this.getObject(nftId);
    const owner = getObjectOwner(result);
    if (!owner || typeof owner === 'string') return void 0;
    if ('ObjectOwner' in owner) return owner.ObjectOwner;
    if ('AddressOwner' in owner) return owner.AddressOwner;
    return void 0;
  }

  async getFields(nftId: string): Promise<NFT.NftField> {
    const result = await this.getObject(nftId);
    return getObjectFields(result) as NFT.NftField;
  }

  async getPositionFields(nftId: string): Promise<NFT.PositionField> {
    const contract = await this.contract.getConfig();
    const result = await this.provider.getDynamicFieldObject({
      parentId: contract.Positions,
      name: { type: 'address', value: nftId },
    });
    return getObjectFields(result) as NFT.PositionField;
  }

  async getPositionFieldsByPositionId(positionId: string): Promise<NFT.PositionField> {
    const result = await this.provider.getObject({
      id: positionId,
      options: { showContent: true },
    });
    validateObjectResponse(result, 'position');
    return getObjectFields(result) as NFT.PositionField;
  }

  async getPositionTick(
    pool: string,
    tickIndex:
      | NFT.PositionField['tick_lower_index']
      | NFT.PositionField['tick_upper_index'],
  ): Promise<NFT.PositionTick | undefined> {
    const response = await this.provider.getDynamicFieldObject({
      parentId: pool,
      name: {
        type: tickIndex.type,
        value: tickIndex.fields,
      },
    });
    const fields = getObjectFields(response) as undefined | NFT.PositionTickField;
    if (!fields) return;

    return {
      tickIndex: this.math.bitsToNumber(fields.name.fields.bits),
      initialized: fields.value.fields.initialized,
      liquidityNet: new BN(
        this.math
          .bitsToNumber(fields.value.fields.liquidity_net.fields.bits, 128)
          .toString(),
      ),
      liquidityGross: new BN(fields.value.fields.liquidity_gross),
      feeGrowthOutsideA: new BN(fields.value.fields.fee_growth_outside_a),
      feeGrowthOutsideB: new BN(fields.value.fields.fee_growth_outside_b),
      rewardGrowthsOutside: fields.value.fields.reward_growths_outside.map(
        (val) => new BN(val),
      ) as [BN, BN, BN],
    };
  }

  async getPositionAPR(opts: {
    poolId: string;
    tickLower: number;
    tickUpper: number;
    fees24h: string | number;
    getPrice(coinType: string): Promise<string | number | undefined>;
  }): Promise<{ fees: string; total: string; rewards: string }> {
    const { poolId, getPrice, fees24h, tickLower, tickUpper } = opts;
    const pool = await this.pool.getPool(poolId);
    const tickCurrent = this.math.bitsToNumber(pool.tick_current_index.fields.bits);
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
      pool,
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
        const { emissions_per_second } = reward.fields;
        const coinType = this.coin.formatCoinType(reward.fields.vault_coin_type);
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
    const tickCurrent = this.math.bitsToNumber(pool.tick_current_index.fields.bits);
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

  async burn(options: NFT.BurnOptions): Promise<TransactionBlock> {
    const { pool, nft } = options;
    const txb = options.txb || new TransactionBlock();
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
    position: NFT.PositionField;
    priceA: string | number | undefined;
    priceB: string | number | undefined;
  }) {
    const { position, poolId, priceA, priceB } = options;
    const pool = await this.pool.getPool(poolId);
    const amount = this.pool.getTokenAmountsFromLiquidity({
      currentSqrtPrice: new BN(pool.sqrt_price),
      lowerSqrtPrice: this.math.tickIndexToSqrtPriceX64(
        this.math.bitsToNumber(position.tick_lower_index.fields.bits),
      ),
      upperSqrtPrice: this.math.tickIndexToSqrtPriceX64(
        this.math.bitsToNumber(position.tick_upper_index.fields.bits),
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
    position: NFT.PositionField;
    getPrice(coinType: string): Promise<string | number | undefined>;
  }) {
    const { position, poolId } = options;
    const positionField = await this.getPositionFieldsByPositionId(position.id.id);
    const [pool, tickLowerDetail, tickUpperDetail] = await Promise.all([
      this.pool.getPool(poolId, 30),
      this.nft.getPositionTick(poolId, positionField.tick_lower_index),
      this.nft.getPositionTick(poolId, positionField.tick_upper_index),
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

  protected async getUnclaimedFees(options: {
    pool: Pool.Pool;
    position: NFT.PositionField;
    getPrice(coinType: string): Promise<string | number | undefined>;
    tickLowerDetail: NFT.PositionTick;
    tickUpperDetail: NFT.PositionTick;
  }) {
    const { position, pool, getPrice, tickLowerDetail, tickUpperDetail } = options;
    const [coinA, coinB, priceA, priceB] = await Promise.all([
      this.coin.getMetadata(pool.types[0]),
      this.coin.getMetadata(pool.types[1]),
      getPrice(pool.types[0]),
      getPrice(pool.types[1]),
    ]);
    const collectFees = collectFeesQuote(this.math, {
      pool,
      position,
      tickLowerDetail: tickLowerDetail!,
      tickUpperDetail: tickUpperDetail!,
    });
    let scaledFeeOwedA = this.math.scaleDown(collectFees.feeOwedA, coinA.decimals);
    let scaledFeeOwedB = this.math.scaleDown(collectFees.feeOwedB, coinB.decimals);

    function isTooLarge(value: string, decimals: number) {
      const max = new Decimal(1_000_000).mul(Decimal.pow(10, decimals));
      return max.lt(value);
    }

    if (isTooLarge(scaledFeeOwedA, coinA.decimals)) {
      scaledFeeOwedA = '0';
      collectFees.feeOwedA = '0';
    }
    if (isTooLarge(scaledFeeOwedB, coinB.decimals)) {
      scaledFeeOwedB = '0';
      collectFees.feeOwedB = '0';
    }

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

  protected async getUnclaimedRewards(options: {
    pool: Pool.Pool;
    position: NFT.PositionField;
    getPrice(coinType: string): Promise<string | number | undefined>;
    tickLowerDetail: NFT.PositionTick;
    tickUpperDetail: NFT.PositionTick;
  }) {
    const { position, pool, getPrice, tickLowerDetail, tickUpperDetail } = options;

    const collectRewards = collectRewardsQuote(this.math, {
      pool,
      position,
      tickLowerDetail: tickLowerDetail!,
      tickUpperDetail: tickUpperDetail!,
    });
    const scaledCollectRewards = [...collectRewards] as typeof collectRewards;
    const coinTypes = pool.reward_infos.map((reward) =>
      this.coin.formatCoinType(reward.fields.vault_coin_type),
    );
    const coins = await Promise.all([
      ...pool.reward_infos.map((_, index) => {
        return this.coin.getMetadata(coinTypes[index]!);
      }),
    ]);
    const prices = await Promise.all(
      pool.reward_infos.map((_, index) => {
        return getPrice(coinTypes[index]!);
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

  protected getObject(nftId: string): Promise<SuiObjectResponse> {
    return this.getCacheOrSet('nft-object-' + nftId, async () => {
      const result = await this.provider.getObject({
        id: nftId,
        options: { showContent: true, showOwner: true },
      });
      validateObjectResponse(result, 'nft');
      return result;
    });
  }
}
