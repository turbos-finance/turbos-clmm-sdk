import type { MathUtil, NFT, Pool } from '../lib';
import BN from 'bn.js';

export const collectFeesQuote = (
  math: MathUtil,
  options: {
    pool: Pick<
      Pool.Pool,
      'fee_growth_global_a' | 'fee_growth_global_b' | 'tick_current_index'
    >;
    position: NFT.PositionField;
    tickLowerDetail: NFT.PositionTick;
    tickUpperDetail: NFT.PositionTick;
  },
) => {
  const { pool, position, tickLowerDetail, tickUpperDetail } = options;
  const feeGrowthGlobalA = new BN(pool.fee_growth_global_a);
  const feeGrowthInsideA = new BN(position.fee_growth_inside_a);
  const tokensOwnedA = new BN(position.tokens_owed_a);
  const feeGrowthGlobalB = new BN(pool.fee_growth_global_b);
  const feeGrowthInsideB = new BN(position.fee_growth_inside_b);
  const tokensOwnedB = new BN(position.tokens_owed_b);
  const liquidity = new BN(position.liquidity);

  let feeGrowthBelowA: BN, feeGrowthBelowB: BN, feeGrowthAboveA: BN, feeGrowthAboveB: BN;

  const currentTick = math.bitsToNumber(pool.tick_current_index.fields.bits);
  const lowerTick = math.bitsToNumber(position.tick_lower_index.fields.bits);
  const upperTick = math.bitsToNumber(position.tick_upper_index.fields.bits);

  if (currentTick < lowerTick) {
    feeGrowthBelowA = math.subUnderflowU128(
      feeGrowthGlobalA,
      tickLowerDetail.feeGrowthOutsideA,
    );
    feeGrowthBelowB = math.subUnderflowU128(
      feeGrowthGlobalB,
      tickLowerDetail.feeGrowthOutsideB,
    );
  } else {
    feeGrowthBelowA = tickLowerDetail.feeGrowthOutsideA;
    feeGrowthBelowB = tickLowerDetail.feeGrowthOutsideB;
  }

  if (currentTick < upperTick) {
    feeGrowthAboveA = tickUpperDetail.feeGrowthOutsideA;
    feeGrowthAboveB = tickUpperDetail.feeGrowthOutsideB;
  } else {
    feeGrowthAboveA = math.subUnderflowU128(
      feeGrowthGlobalA,
      tickUpperDetail.feeGrowthOutsideA,
    );
    feeGrowthAboveB = math.subUnderflowU128(
      feeGrowthGlobalB,
      tickUpperDetail.feeGrowthOutsideB,
    );
  }

  const feeGrowthInsideAX64 = math.subUnderflowU128(
    math.subUnderflowU128(feeGrowthGlobalA, feeGrowthBelowA),
    feeGrowthAboveA,
  );
  const feeGrowthInsideBX64 = math.subUnderflowU128(
    math.subUnderflowU128(feeGrowthGlobalB, feeGrowthBelowB),
    feeGrowthAboveB,
  );

  const feeOwedADelta = math
    .subUnderflowU128(feeGrowthInsideAX64, feeGrowthInsideA)
    .mul(liquidity)
    .shrn(64);
  const feeOwedBDelta = math
    .subUnderflowU128(feeGrowthInsideBX64, feeGrowthInsideB)
    .mul(liquidity)
    .shrn(64);

  return {
    feeOwedA: tokensOwnedA.add(feeOwedADelta).toString(),
    feeOwedB: tokensOwnedB.add(feeOwedBDelta).toString(),
  };
};
