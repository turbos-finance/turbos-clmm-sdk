import { Network } from './network';

export const contractFees: {
  [x in Network]: {
    FEE100BPS: string;
    FEE500BPS: string;
    FEE3000BPS: string;
    FEE10000BPS: string;
  };
} = {
  [Network.localnet]: {
    FEE100BPS: '0x0b550ff9f74ce134958eae15487ced2082cb2787d60f00e51bbcad0006d25dc2',
    FEE500BPS: '0x4de1096aa09c4a6ee8fb8b1ffa0e6e7853456dcab3c388958a808be887935a2b',
    FEE3000BPS: '0x5d88406f8db79bc24937675175c4212a15c50ad4db8299a2187903b2b7658666',
    FEE10000BPS: '0x9028d027e61672dac36a1fb0b190a0e1dab790709a42710adb4fb8d3294cd6d6',
  },
  [Network.devnet]: {
    FEE100BPS: '0x0b550ff9f74ce134958eae15487ced2082cb2787d60f00e51bbcad0006d25dc2',
    FEE500BPS: '0x7b6b8790d7f0b0c1b8ed21bf49ffd09736c01f827d6b52090e72e48f66d297bc',
    FEE3000BPS: '0x9257ee83f64dd178f2a4c13aa7f58f1379c399a326c74843dc48df7cdcaf1e1e',
    FEE10000BPS: '0x61043dc1b8e06a81b4062f8f4667a39a88bc558c86b82b8f611fb6412999ad63',
  },
  [Network.testnet]: {
    FEE100BPS: '0xbf90eb34d923f28a99f46eee8f8f1fa7534285ae5a7a6fb704d76cca5918226f',
    FEE500BPS: '0x5a8e0332faf032d00e270a0e6bf38215a2524ea1ebc36fc24d03f7cb66fdf8b3',
    FEE3000BPS: '0xd0964ca78fe571a53dfd01f4bc2e53339e30d1452aea5e99a4b5eb2c5d9e6469',
    FEE10000BPS: '0xb79eacd687dd38aa6c8adb986d228e15a646efc4244358f21871ce8f4431311d',
  },
  [Network.mainnet]: {
    FEE100BPS: '0x0',
    FEE500BPS: '0x0',
    FEE3000BPS: '0x0',
    FEE10000BPS: '0x0',
  },
};
