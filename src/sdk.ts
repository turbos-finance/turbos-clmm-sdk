import { JsonRpcProvider } from '@mysten/sui.js';
import { Network } from './constants';
import { Pool, Contract, MathUtil, Account, NFT } from './lib';

export class TurbosSdk {
  readonly pool: Pool;
  readonly contract: Contract;
  readonly math = new MathUtil();
  readonly account = new Account();
  readonly nft: NFT;

  constructor(readonly provider: JsonRpcProvider, readonly network: Network) {
    this.contract = new Contract(this);
    this.pool = new Pool(this);
    this.nft = new NFT(this);
  }
}
