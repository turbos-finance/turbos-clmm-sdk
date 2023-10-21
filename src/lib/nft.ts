import { TransactionBlock } from '@mysten/sui.js/transactions';
import { validateObjectResponse } from '../utils/validate-object-response';
import { Base } from './base';
import BN from 'bn.js';
import { getObjectFields, getObjectOwner } from './legacy';
import { SuiObjectResponse } from '@mysten/sui.js/client';

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
