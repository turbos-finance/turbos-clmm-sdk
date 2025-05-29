import type { Transaction } from '@mysten/sui/transactions';
import type { Pool } from './pool';
import { NFT } from './nft';

export declare namespace Position {
  export interface PositionNftField extends NFT.NftField {}

  export interface PositionField extends NFT.PositionField {}

  export interface PositionTickField extends NFT.PositionTickField {}

  export interface PositionTick extends NFT.PositionTick {}

  export interface BurnOptions extends NFT.BurnOptions {}

  export interface UnclaimedFeesAndRewardsResult
    extends NFT.UnclaimedFeesAndRewardsResult {}

  export interface UnclaimedFeesResult extends NFT.UnclaimedFeesResult {}

  export interface UnclaimedRewardsResult extends NFT.UnclaimedRewardsResult {}
}

export class Position extends NFT {
  declare getFields: (nftId: string) => Promise<Position.PositionNftField>;
  declare getPositionFields: (nftId: string) => Promise<Position.PositionField>;
  declare getPositionFieldsByPositionId: (
    positionId: string,
  ) => Promise<Position.PositionField>;

  declare getPositionTick: (
    pool: string,
    tickIndex:
      | Position.PositionField['tick_lower_index']
      | Position.PositionField['tick_upper_index'],
  ) => Promise<Position.PositionTick | undefined>;

  declare burn: (options: Position.BurnOptions) => Promise<Transaction>;

  declare getPositionLiquidityUSD: (options: {
    poolId: string;
    position: Position.PositionField;
    priceA: string | number | undefined;
    priceB: string | number | undefined;
  }) => Promise<string>;

  declare getUnclaimedFeesAndRewards: (options: {
    poolId: string;
    position: Position.PositionField;
    getPrice(coinType: string): Promise<string | number | undefined>;
  }) => Promise<Position.UnclaimedFeesAndRewardsResult>;

  declare getUnclaimedFees: (options: {
    pool: Pool.Pool;
    position: Position.PositionField;
    /**
     * Returning field `unclaimedFees` is based on price
     */
    getPrice?(coinType: string): Promise<string | number | undefined>;
    tickLowerDetail: Position.PositionTick;
    tickUpperDetail: Position.PositionTick;
  }) => Promise<Position.UnclaimedFeesResult>;

  declare getUnclaimedRewards: (options: {
    pool: Pool.Pool;
    position: Position.PositionField;
    /**
     * Returning field `unclaimedRewards` is based on price
     */
    getPrice?(coinType: string): Promise<string | number | undefined>;
    tickLowerDetail: Position.PositionTick;
    tickUpperDetail: Position.PositionTick;
  }) => Promise<Position.UnclaimedRewardsResult>;
}
