import {
  SuiAddress,
  PaginatedCoins,
  TransactionArgument,
  TransactionBlock,
} from '@mysten/sui.js';
import Decimal from 'decimal.js';
import { Base } from './base';

export class Coin extends Base {
  isSUI(coinType: string) {
    return coinType.toLowerCase().indexOf('sui') > -1;
  }

  async selectTradeCoins(
    owner: SuiAddress,
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
  ): TransactionArgument[] {
    return this.isSUI(coinType)
      ? [txb.splitCoins(txb.gas, [txb.pure(amount.toNumber())])[0]!]
      : coinIds.map((id) => txb.object(id));
  }
}
