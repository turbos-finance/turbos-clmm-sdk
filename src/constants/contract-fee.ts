import { Network } from './network';

export const contractFees: {
  [x in Network]: {
    FEE500BPS: string;
    FEE3000BPS: string;
    FEE10000BPS: string;
  };
} = {
  [Network.localnet]: {
    FEE500BPS: '0x4de1096aa09c4a6ee8fb8b1ffa0e6e7853456dcab3c388958a808be887935a2b',
    FEE3000BPS: '0x5d88406f8db79bc24937675175c4212a15c50ad4db8299a2187903b2b7658666',
    FEE10000BPS: '0x9028d027e61672dac36a1fb0b190a0e1dab790709a42710adb4fb8d3294cd6d6',
  },
  [Network.devnet]: {
    FEE500BPS: '0x7b6b8790d7f0b0c1b8ed21bf49ffd09736c01f827d6b52090e72e48f66d297bc',
    FEE3000BPS: '0x9257ee83f64dd178f2a4c13aa7f58f1379c399a326c74843dc48df7cdcaf1e1e',
    FEE10000BPS: '0x61043dc1b8e06a81b4062f8f4667a39a88bc558c86b82b8f611fb6412999ad63',
  },
  [Network.testnet]: {
    FEE500BPS: '0xd234a0c43a7fb259d7805329a4044492b041a7db3af5db00377e65f34f41ff4c',
    FEE3000BPS: '0x9807557f8a9464669c9be1f186c70386af48ddbc923f1e6bc5cb06c8ef76625f',
    FEE10000BPS: '0x3ae004bd1f8cef2f7b41987af59388fcc7664bf983f503f4fa41d6624a49ac09',
  },
  [Network.mainnet]: {
    FEE500BPS: '0x0',
    FEE3000BPS: '0x0',
    FEE10000BPS: '0x0',
  },
};
