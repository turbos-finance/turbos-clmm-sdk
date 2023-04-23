import { JsonRpcProvider } from '@mysten/sui.js';
import { Pool } from './pool';
import { Network } from './constants';
import { Account } from './account';

export class TurbosSdk {
  readonly pool: Pool;
  readonly account = new Account();

  constructor(
    protected readonly provider: JsonRpcProvider,
    protected readonly network: Network,
  ) {
    this.pool = new Pool(this.provider, this.network);
  }
}
