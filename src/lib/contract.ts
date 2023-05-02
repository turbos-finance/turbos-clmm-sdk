import { getObjectFields, getObjectId, getMoveObjectType } from '@mysten/sui.js';
import { contractFees, contracts } from '../constants';
import { Base } from './base';

export declare module Contract {
  export interface Fee {
    fee: number;
    objectId: string;
    type: string;
  }
}

export class Contract extends Base {
  get config() {
    return contracts[this.network];
  }

  protected _fees?: Contract.Fee[] | Promise<Contract.Fee[]>;

  async getFees(): Promise<Contract.Fee[]> {
    if (this._fees) return this._fees;

    const objs = await this.provider.multiGetObjects({
      ids: Object.values(contractFees[this.network]),
      options: { showType: true, showContent: true },
    });
    this._fees = objs.map((obj) => {
      const fee = getObjectFields(obj)!['fee'];
      const objectId = getObjectId(obj);
      let type = getMoveObjectType(obj)!;
      const [_, matched] = type.match(/\<([^)]*)\>/) || [];
      if (matched) {
        type = matched.split(/\s*,\s*/, 1).pop()!;
      }
      return { fee: Number(fee), objectId, type };
    });
    return this._fees;
  }
}
