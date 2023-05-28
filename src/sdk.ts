import {
  Connection,
  JsonRpcProvider,
  testnetConnection,
  mainnetConnection,
} from '@mysten/sui.js';
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
  readonly provider: JsonRpcProvider;

  constructor(network: Network, connection?: Connection);
  constructor(network: Network, provider?: JsonRpcProvider);
  constructor(readonly network: Network, provider?: JsonRpcProvider | Connection) {
    this.provider = provider
      ? provider instanceof Connection
        ? new JsonRpcProvider(provider)
        : provider
      : new JsonRpcProvider(
          network === Network.mainnet ? mainnetConnection : testnetConnection,
        );
    this.contract = new Contract(this);
    this.pool = new Pool(this);
    this.nft = new NFT(this);
    this.coin = new Coin(this);
    this.trade = new Trade(this);
  }
}
