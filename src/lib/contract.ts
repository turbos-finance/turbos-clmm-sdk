import { getObjectFields, getObjectId, getMoveObjectType } from '@mysten/sui.js';
import { contractFees, contracts } from '../constants';
import { Base } from './base';

export declare module Contract {
  export interface Fee {
    fee: number;
    objectId: string;
    type: string;
    tickSpacing: number;
  }
}

export class Contract extends Base {
  get config() {
    return contracts[this.network];
  }

  getFees(): Promise<Contract.Fee[]> {
    return this.getCacheOrSet('fees', async () => {
      const objs = await this.provider.multiGetObjects({
        ids: Object.values(contractFees[this.network]),
        options: { showType: true, showContent: true },
      });
      return objs.map((obj) => {
        const fields = getObjectFields(obj) as { fee: number; tick_spacing: number };
        const objectId = getObjectId(obj);
        let type = getMoveObjectType(obj)!;
        const [_, matched] = type.match(/\<([^)]*)\>/) || [];
        if (matched) {
          type = matched.split(/\s*,\s*/, 1).pop()!;
        }
        return {
          fee: fields.fee,
          objectId,
          type,
          tickSpacing: fields.tick_spacing,
        };
      });
    });
  }
}
