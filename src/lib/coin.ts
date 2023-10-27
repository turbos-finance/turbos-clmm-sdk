import { TransactionObjectArgument, TransactionBlock } from '@mysten/sui.js/transactions';
import { PaginatedCoins } from '@mysten/sui.js/client';
import Decimal from 'decimal.js';
import { Base } from './base';

export class Coin extends Base {
  isSUI(coinType: string) {
    return coinType.toLowerCase().indexOf('sui') > -1;
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
}
