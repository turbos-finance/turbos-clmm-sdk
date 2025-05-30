/// <reference lib="dom" />
import { Network } from '../constants';
import { Base } from './base';
import { getMoveObjectType, getObjectFields, getObjectId } from './legacy';
import * as suiKit from '../utils/sui-kit';
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

    VaultOriginPackageId: string;
    VaultPackageId: string;
    VaultGlobalConfig: string;
    VaultRewarderManager: string;
    VaultUserTierConfig: string;
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
      const objs = await suiKit.multiGetObjects(this.provider, Object.values(fees), {
        showContent: true,
      });
      return objs.map((obj) => {
        const fields = getObjectFields(obj) as { fee: number; tick_spacing: number };
        const objectId = getObjectId(obj);
        const type = getMoveObjectType(obj)!;
        return {
          objectId,
          type: type.split('<')[1]!.slice(0, -1),
          fee: fields.fee,
          tickSpacing: fields.tick_spacing,
        };
      });
    });
  }

  async getFee(tickSpacing: number): Promise<Contract.Fee> {
    const fees = await this.getFees();
    return fees.find((fee) => fee.tickSpacing === tickSpacing)!;
  }

  private fetchJSON() {
    return this.getCacheOrSet('contract-json', async () => {
      const response = await fetch(
        'https://s3.amazonaws.com/app.turbos.finance/sdk/contract.json?t=' + Date.now(),
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
