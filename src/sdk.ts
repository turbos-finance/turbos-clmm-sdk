import { JsonRpcProvider } from '@mysten/sui.js';
import { Pool } from './pool';
import { Network } from './constants';

export class TurbosSdk {
  readonly pool = new Pool(this.provider, this.network);

  constructor(
    protected readonly provider: JsonRpcProvider,
    protected readonly network: Network,
  ) {}
}
