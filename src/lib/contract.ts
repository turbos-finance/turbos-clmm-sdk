import {
  getObjectFields,
  getObjectId,
  getMoveObjectType,
  JsonRpcProvider,
} from '@mysten/sui.js';
import { Network, contractFees, contracts } from '../constants';

export interface Fee {
  fee: number;
  objectId: string;
  type: string;
}

export class Contract {
  constructor(
    protected readonly provider: JsonRpcProvider,
    protected readonly network: Network,
  ) {}

  get contract() {
    return contracts[this.network];
  }

  protected _fees?: Fee[] | Promise<Fee[]>;

  async getFees(): Promise<Fee[]> {
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
