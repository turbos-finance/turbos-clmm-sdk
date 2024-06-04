import { SuiClient, SuiClientOptions, getFullnodeUrl } from '@mysten/sui/client';
import { Network } from './constants';
import { Pool, Contract, MathUtil, Account, NFT, Coin, Trade, Vault } from './lib';

export class TurbosSdk {
  readonly pool: Pool;
  readonly contract: Contract;
  readonly math = new MathUtil();
  readonly account = new Account();
  readonly coin: Coin;
  readonly nft: NFT;
  readonly trade: Trade;
  readonly provider: SuiClient;
  readonly vault: Vault;

  constructor(readonly network: Network, clientOrOptions?: SuiClientOptions | SuiClient) {
    this.provider = clientOrOptions
      ? clientOrOptions instanceof SuiClient
        ? clientOrOptions
        : new SuiClient(clientOrOptions)
      : new SuiClient({
          url:
            network === Network.mainnet
              ? getFullnodeUrl(Network.mainnet)
              : getFullnodeUrl(Network.testnet),
        });

    this.contract = new Contract(this);
    this.pool = new Pool(this);
    this.nft = new NFT(this);
    this.coin = new Coin(this);
    this.trade = new Trade(this);
    this.vault = new Vault(this);
  }
}
