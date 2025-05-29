import type { MathUtil, Pool, Position } from '../lib';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { bitMath } from './bit-math';
import { deprecatedPoolRewards } from './deprecated-pool-rewards';

export const collectRewardsQuote = (
  math: MathUtil,
  options: {
    pool: Pick<
      Pool.Pool,
      | 'reward_last_updated_time_ms'
      | 'reward_infos'
      | 'tick_current_index'
      | 'liquidity'
      | 'id'
    >;
    position: Position.PositionField;
    tickLowerDetail: Position.PositionTick;
    tickUpperDetail: Position.PositionTick;
    timeStampInSeconds?: BN;
  },
) => {
  const { pool, position, tickLowerDetail, tickUpperDetail, timeStampInSeconds } =
    options;
  const rewardLastUpdatedTimestamp = new BN(
    new Decimal(pool.reward_last_updated_time_ms).div(1000).toFixed(0),
  );
  const currTimestampInSeconds =
    timeStampInSeconds ?? new BN(Date.now()).div(new BN(1000));
  const timestampDelta = currTimestampInSeconds.sub(new BN(rewardLastUpdatedTimestamp));
  // @ts-expect-error
  const rewardOwed: [string, string, string] = [];
  const poolLiquidity = new BN(pool.liquidity);
  const positionLiquidity = new BN(position.liquidity);

  for (let i = 0; i < 3; ++i) {
    // Calculate the reward growth on the outside of the position (growth_above, growth_below)
    const poolRewardInfo = pool.reward_infos[i];
    const rewardInfo = {
      emissionsPerSecondX64: new BN(
        poolRewardInfo ? poolRewardInfo.fields.emissions_per_second : '0',
      ),
      growthGlobalX64: new BN(poolRewardInfo ? poolRewardInfo.fields.growth_global : '0'),
    };
    const positionRewardInfo = {
      growthInsideCheckpoint: new BN(
        position.reward_infos[i]?.fields.reward_growth_inside ?? '0',
      ),
      amountOwed: new BN(position.reward_infos[i]?.fields.amount_owed ?? '0'),
    };

    // Increment the global reward growth tracker based on time elasped since the last whirlpool update.
    let adjustedRewardGrowthGlobalX64 = rewardInfo.growthGlobalX64;
    if (!poolLiquidity.isZero()) {
      const rewardGrowthDelta = bitMath.mulDiv(
        timestampDelta,
        rewardInfo.emissionsPerSecondX64,
        poolLiquidity,
        128,
      );
      adjustedRewardGrowthGlobalX64 = rewardInfo.growthGlobalX64.add(rewardGrowthDelta);
    }

    // Calculate the reward growth outside of the position
    const tickLowerRewardGrowthsOutsideX64 = tickLowerDetail.rewardGrowthsOutside[i]!;
    const tickUpperRewardGrowthsOutsideX64 = tickUpperDetail.rewardGrowthsOutside[i]!;

    let rewardGrowthsBelowX64: BN = adjustedRewardGrowthGlobalX64;
    if (tickLowerDetail.initialized) {
      rewardGrowthsBelowX64 =
        math.bitsToNumber(pool.tick_current_index.fields.bits) <
        math.bitsToNumber(position.tick_lower_index.fields.bits)
          ? math.subUnderflowU128(
              adjustedRewardGrowthGlobalX64,
              tickLowerRewardGrowthsOutsideX64,
            )
          : tickLowerRewardGrowthsOutsideX64;
    }

    let rewardGrowthsAboveX64: BN = new BN(0);
    if (tickUpperDetail.initialized) {
      rewardGrowthsAboveX64 =
        math.bitsToNumber(pool.tick_current_index.fields.bits) <
        math.bitsToNumber(position.tick_upper_index.fields.bits)
          ? tickUpperRewardGrowthsOutsideX64
          : math.subUnderflowU128(
              adjustedRewardGrowthGlobalX64,
              tickUpperRewardGrowthsOutsideX64,
            );
    }

    const rewardGrowthInsideX64 = math.subUnderflowU128(
      math.subUnderflowU128(adjustedRewardGrowthGlobalX64, rewardGrowthsBelowX64),
      rewardGrowthsAboveX64,
    );

    // Knowing the growth of the reward checkpoint for the position, calculate and increment the amount owed for each reward.
    const amountOwedX64 = positionRewardInfo.amountOwed.shln(64);

    rewardOwed[i] = deprecatedPoolRewards(pool.id.id, i)
      ? '0'
      : amountOwedX64
          .add(
            math
              .subUnderflowU128(
                rewardGrowthInsideX64,
                positionRewardInfo.growthInsideCheckpoint,
              )
              .mul(positionLiquidity),
          )
          .shrn(64)
          .toString();
  }

  return rewardOwed;
};
