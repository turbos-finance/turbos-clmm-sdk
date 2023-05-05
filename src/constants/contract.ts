import { Network } from './network';

export const contracts: {
  [x in Network]: {
    packageId: string;
    packageIdOriginal: string;
    poolConfig: string;
    positions: string;
    poolFactoryAdminCap: string;
    versioned: string;
  };
} = {
  [Network.localnet]: {
    packageId: '0x6598f635a9f00ea4afb3ccd2000c9aae158e111da389e20051b1b9ce60558202',
    packageIdOriginal:
      '0x6598f635a9f00ea4afb3ccd2000c9aae158e111da389e20051b1b9ce60558202',
    poolConfig: '0x0ea7e8a8afdc8904b118f4a57c1f8eb90caabd93c7ecbce58d725fed7d5cad44',
    positions: '0x2b62ed7297322ba2fafa7800753d2af7112c6b4614497ba9ec8a3467d1569d53',
    poolFactoryAdminCap:
      '0x37f0fc5e721340daf5f587a493edd86e63f0178fb6499344ae96a045d2c7c5fa',
    versioned: '0x65c90f882743d56dd6e1d1d1b8f1dd8ef0104e45cff132d63ea672b3ae589140',
  },
  [Network.devnet]: {
    packageId: '0xd939e34b3199958327614a1c2fd56d4d64f06a101e9cb41c13d1651d79b8f4ad',
    packageIdOriginal:
      '0x6598f635a9f00ea4afb3ccd2000c9aae158e111da389e20051b1b9ce60558202',
    poolConfig: '0x02fea9833e0d1a1b9e226abff32095e3c74b444230eb6799f54ae1b4e00aa2d4',
    positions: '0xa1c922ccccabc978e774cfff0d144931d27d744ac91a57e1b233fcc847562f69',
    poolFactoryAdminCap:
      '0x182766023b248aae470c13e8cc09bdb5c7731a2c4755da27b785cc0db8535695',
    versioned: '0x65c90f882743d56dd6e1d1d1b8f1dd8ef0104e45cff132d63ea672b3ae589140',
  },
  [Network.testnet]: {
    packageId: '0x69b80144d5a6ab496feb2ac7287d2a02d32efaf984f1a7cdffa8827625ef65ec',
    packageIdOriginal:
      '0x8c69a1c4735880e569e6112720ba5e0af058a2e51e5ab8f62010a1186c52cf88',
    poolConfig: '0xc634e7ca54686398be5496ccb19c6d9d3d2bb0266e7ffb92b6490f52f2a812db',
    positions: '0x2cbea82dbce2da616c9f2161f459c779e9bf22906ecee0afd2e04bffd7fd2701',
    poolFactoryAdminCap:
      '0xb8c93f6f39610bfd1ba184f4a6f1580d541c92021114e69b1f53393df0c4780f',
    versioned: '0xe581d8555ada9d355ff55c5eaae73734bce5f87c3b3dff58f3bc53d5b06682df',
  },
  [Network.mainnet]: {
    packageId: '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1',
    packageIdOriginal:
      '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1',
    poolConfig: '0xc294552b2765353bcafa7c359cd28fd6bc237662e5db8f09877558d81669170c',
    positions: '0xf5762ae5ae19a2016bb233c72d9a4b2cba5a302237a82724af66292ae43ae52d',
    poolFactoryAdminCap:
      '0x4bd4c54c84158e4ddab02ba612a84fc4b02dff3cb2ee687db0e46b5ab2f8bc5b',
    versioned: '0xf1cf0e81048df168ebeb1b8030fad24b3e0b53ae827c25053fff0779c1445b6f',
  },
};
