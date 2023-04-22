import {
  TransactionBlock,
  JsonRpcProvider,
  SuiAddress,
  SuiTransactionBlockResponse,
  TransactionArgument,
  SUI_CLOCK_OBJECT_ID,
  getObjectFields,
  getObjectId,
  getMoveObjectType,
} from '@mysten/sui.js';
import { CoinSymbol, Network, coinType, contractFees, contracts } from './constants';
import BigNumber from 'bignumber.js';
import { Fee } from './fee';

const ONE_MINUTE = 60 * 1000;
const GAS_OVERHEAD_PER_COIN = 10n;

export interface PoolCoin {
  symbol: CoinSymbol;
  amount: number;
}

export class Pool {
  constructor(
    protected readonly provider: JsonRpcProvider,
    protected readonly network: Network,
  ) {}

  protected _fees?: Fee[] | Promise<Fee[]>;

  async getFees(): Promise<Fee[]> {
    if (this._fees) return this._fees;

    const objs = await this.provider.multiGetObjects({
      ids: Object.values(contractFees[this.network]),
      options: { showType: true, showContent: true },
    });
    this._fees = objs.map((obj) => {
      const fee = getObjectFields(obj)!['fee'];
      const objectId = getObjectId(obj);
      let type = getMoveObjectType(obj)!;
      const [_, matched] = type.match(/\<([^)]*)\>/) || [];
      if (matched) {
        type = matched.split(/\s*,\s*/, 1).pop()!;
      }
      return new Fee(Number(fee), objectId, type);
    });
    return this._fees;
  }

  async createPool(options: {
    address: SuiAddress;
    fee: Fee;
    coins: [PoolCoin, PoolCoin];
    minTick: number;
    maxTick: number;
    currentPrice: number;
    slippage: BigNumber | number | string;
    signAndExecute: (txb: TransactionBlock) => Promise<SuiTransactionBlockResponse>;
  }): Promise<SuiTransactionBlockResponse> {
    const {
      coins,
      fee,
      address,
      minTick,
      maxTick,
      slippage,
      currentPrice,
      signAndExecute,
    } = options;
    const contract = contracts[this.network];
    // From small to big
    coins.sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
    const coinA = coins[0];
    const coinB = coins[1];
    const coinTypeA = coinType[coinA.symbol][this.network];
    const coinTypeB = coinType[coinB.symbol][this.network];
    const amountA = this.scaleAmount(coinA.amount);
    const amountB = this.scaleAmount(coinB.amount);
    const [coinIdsA, coinIdsB] = await Promise.all([
      this.selectCoinsIds(address, coinTypeA, amountA),
      this.selectCoinsIds(address, coinTypeB, amountB),
    ]);

    const txb = new TransactionBlock();
    txb.moveCall({
      target: `${contract.packageId}::pool_factory::deploy_pool_and_mint`,
      typeArguments: [coinA.symbol, coinB.symbol, fee.type],
      arguments: [
        // pool_config
        txb.object(contract.poolConfig),
        // fee_type?
        txb.object(fee.objectId),
        // sqrt_price
        txb.pure(Math.sqrt(currentPrice), 'u128'),
        // positions
        txb.object(contract.positions),
        // coins
        txb.makeMoveVec({
          objects: this.stripGas(txb, coinIdsA, coinTypeA, amountA),
        }),
        txb.makeMoveVec({
          objects: this.stripGas(txb, coinIdsB, coinTypeB, amountB),
        }),
        // tick_lower_index
        txb.pure(Math.abs(minTick).toFixed(0), 'u32'),
        txb.pure(minTick < 0, 'bool'),
        // tick_upper_index
        txb.pure(Math.abs(maxTick).toFixed(0), 'u32'),
        txb.pure(maxTick < 0, 'bool'),
        // amount_desired
        txb.pure(amountA.toString(), 'u128'),
        txb.pure(amountB.toString(), 'u128'),
        // amount_min
        txb.pure(this.getMinimumAmount(amountA, fee.fee, slippage), 'u64'),
        txb.pure(this.getMinimumAmount(amountB, fee.fee, slippage), 'u64'),
        // recipient
        txb.object(address),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE, '128'),
        // ctx
        txb.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    const gas = await this.calculateGas(
      txb,
      address,
      this.isSUI(coinTypeA) ? amountA : this.isSUI(coinTypeB) ? amountB : undefined,
    );
    txb.setGasBudget(gas);

    return signAndExecute(txb);
  }

  protected async calculateGas(
    tx: TransactionBlock,
    address: SuiAddress,
    amount?: BigNumber,
  ): Promise<bigint> {
    const { totalBalance } = await this.provider.getBalance({
      owner: address,
      coinType: coinType.SUI[this.network],
    });
    const remaining = amount
      ? BigNumber(totalBalance).minus(amount).toString()
      : totalBalance;

    const txb = new TransactionBlock(tx);
    txb.setSenderIfNotSet(address);
    txb.setGasBudget(BigInt(remaining));
    const { effects, input } = await this.provider.dryRunTransactionBlock({
      transactionBlock: await txb.build({
        provider: this.provider,
        onlyTransactionKind: false,
      }),
    });

    if (effects.status.status !== 'success') {
      throw new Error(
        `Could not automatically determine a gas budget: ${effects.status.error}`,
      );
    }

    const gasPrice = await this.provider.getReferenceGasPrice();
    return (
      BigInt(effects.gasUsed.computationCost) +
      BigInt(effects.gasUsed.storageCost) +
      GAS_OVERHEAD_PER_COIN *
        BigInt(input?.gasData.payment?.length || 0n) *
        BigInt(gasPrice || 1n)
    );
  }

  protected getMinimumAmount(
    value: BigNumber | number | string,
    fee: BigNumber | number | string,
    slippage: BigNumber | number | string,
  ) {
    const feeRate = BigNumber(1).minus(BigNumber(fee).div(10000).div(100));
    const slippageRate = BigNumber(1).minus(BigNumber(slippage).div(100));
    return BigNumber(value).multipliedBy(feeRate).multipliedBy(slippageRate).toFixed(0);
  }

  protected scaleAmount(amount: number) {
    return BigNumber(amount).multipliedBy(10 ** 9);
  }

  protected async selectCoinsIds(
    owner: SuiAddress,
    coinType: string,
    needAmount: BigNumber,
  ) {
    const { data: coins } = await this.provider.getCoins({ owner, coinType });
    const coinIds: string[] = [];
    let totalAmount = BigNumber(0);

    coins.sort((a, b) => {
      // From big to small
      return BigNumber(a.balance).isLessThan(BigNumber(b.balance)) ? 1 : -1;
    });

    for (const coin of coins) {
      coinIds.push(coin.coinObjectId);
      totalAmount = totalAmount.plus(coin.balance);
      if (totalAmount.isGreaterThanOrEqualTo(needAmount)) {
        break;
      }
    }
    return coinIds;
  }

  protected stripGas(
    txb: TransactionBlock,
    coinIds: string[],
    coinType: string,
    amount: BigNumber,
  ): TransactionArgument[] {
    return this.isSUI(coinType)
      ? txb.splitCoins(txb.gas, [txb.pure(amount.toNumber())]).slice(0, 1)
      : coinIds.map((id) => txb.object(id));
  }

  protected isSUI(coinType: string) {
    return coinType.toLowerCase().indexOf('sui') > -1;
  }
}
