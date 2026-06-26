import { type TransactionObjectArgument, Transaction } from '@mysten/sui/transactions';
import type { SuiClientTypes } from '@mysten/sui/client';
import Decimal from 'decimal.js';
import { Base } from './base';
import { normalizeStructTag } from '@mysten/sui/utils';

export class Coin extends Base {
  isSUI(coinType: string) {
    // 2.0's normalizeStructTag throws on invalid struct tags (1.x did not); catch and return false.
    // Case-insensitive comparison preserves the semantics of existing tests.
    try {
      return (
        normalizeStructTag(coinType).toLowerCase() ===
        '0x0000000000000000000000000000000000000000000000000000000000000002::sui::sui'
      );
    } catch {
      return false;
    }
  }

  async getMetadata(coinType: string) {
    return this.getCacheOrSet(`coin-metadata-${coinType}`, async () => {
      const { coinMetadata } = await this.provider.core.getCoinMetadata({ coinType });
      if (!coinMetadata) {
        throw new Error(`Coin "${coinType}" is not found`);
      }
      return coinMetadata;
    });
  }

  async selectTradeCoins(
    owner: string,
    coinType: string,
    expectedAmount: Decimal,
  ): Promise<string[]> {
    if (expectedAmount.eq(0)) {
      return [];
    }

    const coins: SuiClientTypes.Coin[] = [];
    const coinIds: string[] = [];
    let totalAmount = new Decimal(0);
    let result: SuiClientTypes.ListCoinsResponse | undefined;

    do {
      result = await this.provider.core.listCoins({
        owner,
        coinType,
        cursor: result?.cursor,
      });
      coins.push(...result.objects);
    } while (result.hasNextPage);

    coins.sort((a, b) => {
      // From big to small
      return Number(b.balance) - Number(a.balance);
    });

    for (const coin of coins) {
      coinIds.push(coin.objectId);
      totalAmount = totalAmount.add(coin.balance);
      if (totalAmount.gte(expectedAmount)) {
        break;
      }
    }
    return coinIds;
  }

  convertTradeCoins(
    txb: Transaction,
    coinIds: string[],
    coinType: string,
    amount: Decimal,
  ): TransactionObjectArgument[] {
    if (this.isSUI(coinType)) {
      return [txb.splitCoins(txb.gas, [txb.pure.u64(amount.toNumber())])];
    } else {
      if (coinIds.length > 1) {
        const [coin, ...mergeCoins] = coinIds;
        const coinObject = txb.object(coin!);
        txb.mergeCoins(
          coinObject,
          mergeCoins.map((coin) => txb.object(coin)),
        );
        return [txb.splitCoins(coinObject, [txb.pure.u64(amount.toNumber())])];
      }

      return [txb.splitCoins(coinIds[0]!, [txb.pure.u64(amount.toNumber())])];
    }
  }

  zero(token: string, txb: Transaction): TransactionObjectArgument {
    return txb.moveCall({
      typeArguments: [token],
      target: `0x2::coin::zero`,
      arguments: [],
    });
  }

  formatCoinType(type: string, fillZero: boolean = false) {
    const HASH_LENGTH = 64;
    let address = type.replace(/^0x/i, '');
    address = address.replace(/^0+(2::sui::SUI)$/, '$1');

    const fill =
      fillZero && address.length < HASH_LENGTH && type !== '2::sui:SUI'
        ? '0'.repeat(HASH_LENGTH - address.length)
        : '';

    return '0x' + fill + address;
  }

  async takeAmountFromCoins(
    address: string,
    coinType: string,
    amount: number,
    txb: Transaction,
  ) {
    const coins = await this.selectTradeCoins(address, coinType, new Decimal(amount));

    if (this.isSUI(coinType)) {
      return [this.splitSUIFromGas([amount], txb)];
    } else {
      return this.splitMultiCoins(coins, [amount], txb);
    }
  }

  splitSUIFromGas(amount: number[], txb: Transaction) {
    return txb.splitCoins(txb.gas, amount);
  }

  splitMultiCoins(coins: string[], amounts: number[], txb: Transaction) {
    const coinObjects = coins.map((coin) => txb.object(coin));
    const mergedCoin = coinObjects[0]!;
    if (coins.length > 1) {
      txb.mergeCoins(mergedCoin, coinObjects.slice(1));
    }
    const splitedCoins = txb.splitCoins(mergedCoin, amounts);
    return [splitedCoins, mergedCoin];
  }
}
