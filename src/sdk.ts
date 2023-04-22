import { JsonRpcProvider } from '@mysten/sui.js';
import { Pool } from './pool';
import { Network } from './constants';
import { Account } from './account';

export class TurbosSdk {
  readonly pool = new Pool(this.provider, this.network);
  readonly account = new Account();

  constructor(
    protected readonly provider: JsonRpcProvider,
    protected readonly network: Network,
  ) {}
}
