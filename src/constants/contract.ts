import { Network } from './network';

export const contracts: {
  [x in Network]: {
    packageId: string;
    poolConfig: string;
    positions: string;
    poolFactoryAdminCap: string;
  };
} = {
  [Network.localnet]: {
    packageId: '0x6598f635a9f00ea4afb3ccd2000c9aae158e111da389e20051b1b9ce60558202',
    poolConfig: '0x0ea7e8a8afdc8904b118f4a57c1f8eb90caabd93c7ecbce58d725fed7d5cad44',
    positions: '0x2b62ed7297322ba2fafa7800753d2af7112c6b4614497ba9ec8a3467d1569d53',
    poolFactoryAdminCap:
      '0x37f0fc5e721340daf5f587a493edd86e63f0178fb6499344ae96a045d2c7c5fa',
  },
  [Network.devnet]: {
    packageId: '0x6303307a3b8b567f6ca33a82fa59b3f35a694111b921a39c8304eaccd0275faf',
    poolConfig: '0x02fea9833e0d1a1b9e226abff32095e3c74b444230eb6799f54ae1b4e00aa2d4',
    positions: '0xa1c922ccccabc978e774cfff0d144931d27d744ac91a57e1b233fcc847562f69',
    poolFactoryAdminCap:
      '0x182766023b248aae470c13e8cc09bdb5c7731a2c4755da27b785cc0db8535695',
  },
  [Network.testnet]: {
    packageId: '0x5825e3c103e8de1e84970441b0f9e11302746ac08880bcf8dbc6390d09f0eb0a',
    poolConfig: '0xc0d8f98a89d813fe60560206b7ba5ac7d9d7625c3d7a4ec59e0cdc5a432348ba',
    positions: '0x0c73e2c660aa77df582a1f37a7d16afccc253b8d844e08f0e21619e8ed6af63c',
    poolFactoryAdminCap:
      '0x768248c5bb275ccb32f2687d99a12def0080262d91ec33c9bcf9784b578201df',
  },
  [Network.mainnet]: {
    packageId: '0x0',
    poolConfig: '0x0',
    positions: '0x0',
    poolFactoryAdminCap: '0x0',
  },
};
