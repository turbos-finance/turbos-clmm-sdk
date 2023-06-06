import { SuiObjectResponse, getObjectFields, getObjectOwner } from '@mysten/sui.js';
import { validateObjectResponse } from '../utils/validate-object-response';
import { Base } from './base';

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
    return this.getCacheOrSet('nft-position-fields-' + nftId, async () => {
      const contract = await this.contract.getConfig();
      const result = await this.provider.getDynamicFieldObject({
        parentId: contract.Positions,
        name: { type: 'address', value: nftId },
      });
      return getObjectFields(result) as NFT.PositionField;
    });
  }

  async getPositionFieldsByPositionId(positionId: string): Promise<NFT.PositionField> {
    return this.getCacheOrSet('position-fields-' + positionId, async () => {
      const result = await this.provider.getObject({
        id: positionId,
        options: { showContent: true },
      });
      validateObjectResponse(result, 'position');
      return getObjectFields(result) as NFT.PositionField;
    });
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
