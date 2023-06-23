# Installation

```bash
pnpm add turbos-clmm-sdk @mysten/sui.js
```

# Modules

- contract
- trade
- pool
- nft
- account
- math

# Initial SDK

```typescript
import { JsonRpcProvider, testnetConnection } from '@mysten/sui.js';
import { Network, TurbosSdk } from 'turbos-clmm-sdk';

// Choose one way
export const sdk = new TurbosSdk(Network.testnet);
export const sdk = new TurbosSdk(Network.testnet, testnetConnection);
export const sdk = new TurbosSdk(Network.testnet, new JsonRpcProvider(testnetConnection));
```

# Module:Contract

### getConfig

```typescript
import type { Contract } from 'turbos-clmm-sdk';

const contract = await sdk.contract.getConfig(); // interface: Contract.Config
```

### getFees

```typescript
import type { Contract } from 'turbos-clmm-sdk';

const fees = await sdk.contract.getFees(); // interface: Contract.Fee[]
```

# Module:Trade

### computeSwapResult

```typescript
import type { Trade } from 'turbos-clmm-sdk';

// interface: Trade.ComputedSwapResult
const swapResult = await sdk.trade.computeSwapResult({
  pool: string;
  a2b: boolean;
  address: string;
  amountSpecified: number | string;
  amountSpecifiedIsInput: boolean;
});
```

### swap

```typescript
const txb = await sdk.trade.swap({
  /**
   * nextTickIndex = sdk.math.bitsToNumber(swapResult.tick_current_index.bits)
   */
  routes: { pool: string; a2b: boolean; nextTickIndex: number }[];
  coinTypeA: string;
  coinTypeB: string;
  address: string;
  amountA: number | string;
  amountB: number | string;
  amountSpecifiedIsInput: boolean;
  slippage: string;
  txb?: TransactionBlock;
});
```
