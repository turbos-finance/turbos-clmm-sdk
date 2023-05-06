/// <reference lib="dom" />
import { getObjectFields, getObjectId, getMoveObjectType } from '@mysten/sui.js';
import { Network } from '../constants';
import { Base } from './base';
export declare module Contract {
  export interface Fee {
    fee: number;
    objectId: string;
    type: string;
    tickSpacing: number;
  }

  export interface Config {
    PackageId: string;
    PackageIdOriginal: string;
    PoolConfig: string;
    Positions: string;
    PoolFactoryAdminCap: string;
    Versioned: string;
    PoolTableId: string;
  }
}

export class Contract extends Base {
  async getConfig(): Promise<Contract.Config> {
    const contractJSON = await this.fetchJSON();
    return contractJSON[this.network].contract;
  }

  getFees(): Promise<Contract.Fee[]> {
    return this.getCacheOrSet('fees', async () => {
      const contractJSON = await this.fetchJSON();
      const fees = contractJSON[this.network].fee;
      const objs = await this.provider.multiGetObjects({
        ids: Object.values(fees),
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

  private fetchJSON() {
    return this.getCacheOrSet('contract-json', async () => {
      const response = await fetch(
        'https://s3.amazonaws.com/app.turbos.finance/sdk/contract.json',
        {
          method: 'GET',
        },
      );
      const data = await response.json();
      return data as {
        [key in Network]: {
          contract: Contract.Config;
          fee: Record<string, string>;
        };
      };
    });
  }
}
