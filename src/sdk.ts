import { JsonRpcProvider } from '@mysten/sui.js';
import { Network } from './constants';
import { Pool, Contract, MathUtil, Account, NFT, Coin, Trade } from './lib';

export class TurbosSdk {
  readonly pool: Pool;
  readonly contract: Contract;
  readonly math = new MathUtil();
  readonly account = new Account();
  readonly coin: Coin;
  readonly nft: NFT;
  readonly trade: Trade;

  constructor(readonly provider: JsonRpcProvider, readonly network: Network) {
    this.contract = new Contract(this);
    this.pool = new Pool(this);
    this.nft = new NFT(this);
    this.coin = new Coin(this);
    this.trade = new Trade(this);
  }
}
