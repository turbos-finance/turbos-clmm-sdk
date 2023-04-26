import {
  TransactionBlock,
  JsonRpcProvider,
  SuiAddress,
  SuiTransactionBlockResponse,
  TransactionArgument,
  SUI_CLOCK_OBJECT_ID,
  PaginatedCoins,
} from '@mysten/sui.js';
import { Fee } from './fee';
import Decimal from 'decimal.js';
import type { MathUtil } from './math';
import { Contract } from './contract';

const ONE_MINUTE = 60 * 1000;
const GAS_OVERHEAD_PER_COIN = 10n;

export interface CreatePoolOptions {
  address: SuiAddress;
  fee: Fee;
  coins: [
    a: { coinType: string; amount: number | string },
    b: { coinType: string; amount: number | string },
  ];
  minPrice: number | string | Decimal;
  maxPrice: number | string | Decimal;
  currentPrice: number | string | Decimal;
  slippage: number | string | Decimal;
  signAndExecute: (txb: TransactionBlock) => Promise<SuiTransactionBlockResponse>;
}

export class Pool {
  constructor(
    protected readonly provider: JsonRpcProvider,
    protected readonly contract: Contract,
    protected readonly math: MathUtil,
  ) {}

  async createPool(options: CreatePoolOptions): Promise<SuiTransactionBlockResponse> {
    const {
      coins,
      fee,
      address,
      minPrice,
      maxPrice,
      currentPrice,
      slippage,
      signAndExecute,
    } = options;
    const contract = this.contract.contract;
    const [
      { coinType: coinTypeA, amount: amountA },
      { coinType: coinTypeB, amount: amountB },
    ] = coins;
    const [coinA, coinB] = await Promise.all([
      this.provider.getCoinMetadata({ coinType: coinTypeA }),
      this.provider.getCoinMetadata({ coinType: coinTypeB }),
    ]);
    const currentSqrtPrice = this.math.priceToSqrtPriceX64(
      new Decimal(currentPrice),
      coinA.decimals,
      coinB.decimals,
    );
    const minTick = this.math.priceToTickIndex(
      new Decimal(minPrice),
      coinA.decimals,
      coinB.decimals,
    );
    const maxTick = this.math.priceToTickIndex(
      new Decimal(maxPrice),
      coinA.decimals,
      coinB.decimals,
    );
    const bigAmountA = this.math.scaleUp(amountA, coinA.decimals);
    const bigAmountB = this.math.scaleUp(amountB, coinB.decimals);
    const [coinIdsA, coinIdsB] = await Promise.all([
      this.selectCoinIds(address, coinTypeA, bigAmountA),
      this.selectCoinIds(address, coinTypeB, bigAmountB),
    ]);

    const txb = new TransactionBlock();
    txb.moveCall({
      target: `${contract.packageId}::pool_factory::deploy_pool_and_mint`,
      typeArguments: [coinTypeA, coinTypeB, fee.type],
      arguments: [
        // pool_config
        txb.object(contract.poolConfig),
        // fee_type?
        txb.object(fee.objectId),
        // sqrt_price
        txb.pure(currentSqrtPrice, 'u128'),
        // positions
        txb.object(contract.positions),
        // coins
        txb.makeMoveVec({
          objects: this.stripGas(txb, coinIdsA, coinTypeA, bigAmountA),
        }),
        txb.makeMoveVec({
          objects: this.stripGas(txb, coinIdsB, coinTypeB, bigAmountB),
        }),
        // tick_lower_index
        txb.pure(Math.abs(minTick).toFixed(0), 'u32'),
        txb.pure(minTick < 0, 'bool'),
        // tick_upper_index
        txb.pure(Math.abs(maxTick).toFixed(0), 'u32'),
        txb.pure(maxTick < 0, 'bool'),
        // amount_desired
        txb.pure(bigAmountA.toString(), 'u128'),
        txb.pure(bigAmountB.toString(), 'u128'),
        // amount_min
        txb.pure(this.getMinimumAmount(bigAmountA, fee.fee, slippage), 'u64'),
        txb.pure(this.getMinimumAmount(bigAmountB, fee.fee, slippage), 'u64'),
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
      this.isSUI(coinTypeA) ? bigAmountA : this.isSUI(coinTypeB) ? bigAmountB : undefined,
    );
    txb.setGasBudget(gas);

    return signAndExecute(txb);
  }

  protected async calculateGas(
    tx: TransactionBlock,
    address: SuiAddress,
    amount?: Decimal,
  ): Promise<bigint> {
    const { totalBalance } = await this.provider.getBalance({
      owner: address,
      coinType: '0x2::sui::SUI',
    });
    const remaining = amount
      ? new Decimal(totalBalance).minus(amount).toString()
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
    value: Decimal | number | string,
    fee: Decimal | number | string,
    slippage: Decimal | number | string,
  ) {
    const feeRate = new Decimal(1).minus(new Decimal(fee).div(10000).div(100));
    const slippageRate = new Decimal(1).minus(new Decimal(slippage).div(100));
    return new Decimal(value).mul(feeRate).mul(slippageRate).toFixed(0);
  }

  protected async selectCoinIds(
    owner: SuiAddress,
    coinType: string,
    needAmount: Decimal,
  ) {
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
      if (totalAmount.gte(needAmount)) {
        break;
      }
    }
    return coinIds;
  }

  protected stripGas(
    txb: TransactionBlock,
    coinIds: string[],
    coinType: string,
    amount: Decimal,
  ): TransactionArgument[] {
    return this.isSUI(coinType)
      ? txb.splitCoins(txb.gas, [txb.pure(amount.toNumber())]).slice(0, 1)
      : coinIds.map((id) => txb.object(id));
  }

  protected isSUI(coinType: string) {
    return coinType.toLowerCase().indexOf('sui') > -1;
  }
}
