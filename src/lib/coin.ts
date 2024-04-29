import {
  type TransactionObjectArgument,
  TransactionBlock,
} from '@mysten/sui.js/transactions';
import { PaginatedCoins } from '@mysten/sui.js/client';
import Decimal from 'decimal.js';
import { Base } from './base';
import { normalizeSuiAddress } from '@mysten/sui.js/utils';

export class Coin extends Base {
  isSUI(coinType: string) {
    return (
      normalizeSuiAddress(coinType) ===
      '0x000000000000000000000000000000000000000000000000000002::sui::sui'
    );
  }

  async getMetadata(coinType: string) {
    return this.getCacheOrSet(`coin-metadata-${coinType}`, async () => {
      const result = await this.provider.getCoinMetadata({ coinType });
      if (!result) {
        throw new Error(`Coin "${coinType}" is not found`);
      }
      return result;
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

    const coins: PaginatedCoins['data'][number][] = [];
    const coinIds: string[] = [];
    let totalAmount = new Decimal(0);
    let result: PaginatedCoins | undefined;

    do {
      result = await this.provider.getCoins({
        owner,
        coinType,
        cursor: result?.nextCursor,
      });
      coins.push(...result.data);
    } while (result.hasNextPage);

    coins.sort((a, b) => {
      // From big to small
      return Number(b.balance) - Number(a.balance);
    });

    for (const coin of coins) {
      coinIds.push(coin.coinObjectId);
      totalAmount = totalAmount.add(coin.balance);
      if (totalAmount.gte(expectedAmount)) {
        break;
      }
    }
    return coinIds;
  }

  convertTradeCoins(
    txb: TransactionBlock,
    coinIds: string[],
    coinType: string,
    amount: Decimal,
  ): TransactionObjectArgument[] {
    return this.isSUI(coinType)
      ? [txb.splitCoins(txb.gas, [txb.pure(amount.toNumber())])[0]!]
      : coinIds.map((id) => txb.object(id));
  }

  zero(token: string, txb: TransactionBlock): TransactionObjectArgument {
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
    txb: TransactionBlock,
  ) {
    const coins = await this.selectTradeCoins(address, coinType, new Decimal(amount));

    if (this.isSUI(coinType)) {
      return [this.splitSUIFromGas([amount], txb)];
    } else {
      return this.splitMultiCoins(coins, [amount], txb);
    }
  }

  splitSUIFromGas(amount: number[], txb: TransactionBlock) {
    return txb.splitCoins(txb.gas, amount);
  }

  splitMultiCoins(coins: string[], amounts: number[], txb: TransactionBlock) {
    const coinObjects = coins.map((coin) => txb.object(coin));
    const mergedCoin = coinObjects[0]!;
    if (coins.length > 1) {
      txb.mergeCoins(mergedCoin, coinObjects.slice(1));
    }
    const splitedCoins = txb.splitCoins(mergedCoin, amounts);
    return [splitedCoins, mergedCoin];
  }
}
