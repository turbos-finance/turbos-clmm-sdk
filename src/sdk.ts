import { JsonRpcProvider } from '@mysten/sui.js';
import { Network } from './constants';
import { Pool, Contract, MathUtil, Account } from './lib';

export class TurbosSdk {
  readonly pool: Pool;
  readonly contract: Contract;
  readonly math = new MathUtil();
  readonly account = new Account();

  constructor(
    protected readonly provider: JsonRpcProvider,
    protected readonly network: Network,
  ) {
    this.contract = new Contract(this.provider, this.network);
    this.pool = new Pool(this.provider, this.contract, this.math);
  }
}
