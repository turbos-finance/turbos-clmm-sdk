# Installation

```bash
pnpm add turbos-clmm-sdk @mysten/sui.js
```

# Usage

### Initial SDK

```typescript
import { JsonRpcProvider, testnetConnection } from '@mysten/sui.js';
import { Network, TurbosSdk } from 'turbos-clmm-sdk';

const provider = new JsonRpcProvider(testnetConnection);
export const sdk = new TurbosSdk(provider, Network.testnet);
```

## Get signer from mnemonic

```typescript
const mnemonic = sdk.account.generateMnemonic(); // OR from your own
const keypair = sdk.account.getKeypairFromMnemonics(mnemonic);
const signer = new RawSigner(keypair, provider);
```

### Get fee list

```typescript
const fees = await sdk.contract.getFees(); // Fee[]
```

### Create a pool

```typescript
import { RawSigner } from '@mysten/sui.js';

const fees = await sdk.contract.getFees();

const result = await sdk.pool.createPool({
  address: '0x12345abcde',
  fee: fees[0],
  coins: ['0x2::sui:SUI', '0x123abcd::coin:COIN'],
  amount: [5, 10],
  currentPrice: 200,
  minPrice: 100,
  maxPrice: 1000,
  slippage: 0.2,
  signAndExecute(txb, provider) {
    return signer.signAndExecuteTransactionBlock(txb);
  },
});
```

### Add pool liquidity

```typescript
const result = await sdk.pool.createPool({
  pool: '0x1234567abcdefg', // Pool ID
  address: '0x12345abcde',
  amount: [5, 10],
  minPrice: 100,
  maxPrice: 1000,
  slippage: 0.2,
  signAndExecute(txb, provider) {
    return signer.signAndExecuteTransactionBlock(txb);
  },
});
```
