import { Network } from './network';

export enum CoinSymbol {
  sui = 'SUI',
  eth = 'ETH',
  btc = 'BTC',
  usdc = 'USDC',
}

export const coinType: {
  [K in CoinSymbol]: {
    [P in Network]: string;
  };
} = {
  [CoinSymbol.sui]: {
    [Network.localnet]: '0x2::sui::SUI',
    [Network.devnet]: '0x2::sui::SUI',
    [Network.testnet]: '0x2::sui::SUI',
    [Network.mainnet]: '0x2::sui::SUI',
  },
  [CoinSymbol.eth]: {
    [Network.localnet]:
      '0x48c5a4db0bae1500bec28bd5699e2bdc833b977e104335984b611bff3782932f::eth::ETH',
    [Network.devnet]:
      '0x597bb3ec2d6b4aa25e95f61199ceb7aef2b6149dfd449c38ec67f436e42e7b99::eth::ETH',
    [Network.testnet]: '0x0',
    [Network.mainnet]: '0x0',
  },
  [CoinSymbol.btc]: {
    [Network.localnet]:
      '0x48c5a4db0bae1500bec28bd5699e2bdc833b977e104335984b611bff3782932f::btc::BTC',
    [Network.devnet]:
      '0x597bb3ec2d6b4aa25e95f61199ceb7aef2b6149dfd449c38ec67f436e42e7b99::btc::BTC',
    [Network.testnet]: '0x0',
    [Network.mainnet]: '0x0',
  },
  [CoinSymbol.usdc]: {
    [Network.localnet]:
      '0x48c5a4db0bae1500bec28bd5699e2bdc833b977e104335984b611bff3782932f::usdc::USDC',
    [Network.devnet]:
      '0x597bb3ec2d6b4aa25e95f61199ceb7aef2b6149dfd449c38ec67f436e42e7b99::usdc::USDC',
    [Network.testnet]: '0x0',
    [Network.mainnet]: '0x0',
  },
};
