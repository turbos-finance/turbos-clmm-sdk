import { SuiGrpcClient, type SuiGrpcClientOptions } from '@mysten/sui/grpc';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Network } from './constants';
import { Pool, Contract, MathUtil, Account, Coin, Trade, Vault, Position } from './lib';

export class TurbosSdk {
  readonly pool: Pool;
  readonly contract: Contract;
  readonly math = new MathUtil();
  readonly account = new Account();
  readonly coin: Coin;
  readonly position: Position;
  readonly trade: Trade;
  readonly provider: ClientWithCoreApi;
  readonly vault: Vault;

  constructor(
    readonly network: Network,
    clientOrOptions?: ClientWithCoreApi | SuiGrpcClientOptions,
  ) {
    const grpcNetwork = network === Network.mainnet ? 'mainnet' : 'testnet';
    this.provider =
      clientOrOptions && 'core' in clientOrOptions
        ? (clientOrOptions as ClientWithCoreApi)
        : new SuiGrpcClient(
            (clientOrOptions as SuiGrpcClientOptions | undefined) ?? {
              network: grpcNetwork,
              baseUrl:
                network === Network.mainnet
                  ? 'https://fullnode.mainnet.sui.io:443'
                  : 'https://fullnode.testnet.sui.io:443',
            },
          );

    this.contract = new Contract(this);
    this.pool = new Pool(this);
    this.position = new Position(this);
    this.coin = new Coin(this);
    this.trade = new Trade(this);
    this.vault = new Vault(this);
  }
}
