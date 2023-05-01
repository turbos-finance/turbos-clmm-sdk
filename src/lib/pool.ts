import {
  TransactionBlock,
  JsonRpcProvider,
  SuiAddress,
  SuiTransactionBlockResponse,
  TransactionArgument,
  SUI_CLOCK_OBJECT_ID,
  PaginatedCoins,
  getObjectFields,
  getObjectType,
} from '@mysten/sui.js';
import { Fee } from './fee';
import Decimal from 'decimal.js';
import { MathUtil } from './math';
import { Contract } from './contract';

const ONE_MINUTE = 60 * 1000;

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

export interface AddLiquidityOptions {
  address: SuiAddress;
  pool: string;
  amount: [a: number | string, b: number | string];
  minPrice: number | string | Decimal;
  maxPrice: number | string | Decimal;
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

    return signAndExecute(txb);
  }

  async addLiquidity(options: AddLiquidityOptions): Promise<SuiTransactionBlockResponse> {
    const {
      address,
      amount: [amountA, amountB],
      minPrice,
      maxPrice,
      slippage,
      signAndExecute,
      pool,
    } = options;
    const contract = this.contract.contract;
    const poolObject = await this.provider.getObject({
      id: pool,
      options: { showContent: true, showType: true },
    });
    const fields = getObjectFields(poolObject) as PoolFields;
    const typeArguments = this.getPoolTypeArguments(getObjectType(poolObject)!);
    const coinTypeA = typeArguments[0];
    const coinTypeB = typeArguments[1];
    const [coinA, coinB] = await Promise.all([
      this.provider.getCoinMetadata({ coinType: coinTypeA }),
      this.provider.getCoinMetadata({ coinType: coinTypeB }),
    ]);

    const txb = new TransactionBlock();
    const bigAmountA = this.math.scaleUp(amountA, coinA.decimals);
    const bigAmountB = this.math.scaleUp(amountB, coinB.decimals);
    const [coinIdsA, coinIdsB] = await Promise.all([
      this.selectCoinIds(address, coinTypeA, bigAmountA),
      this.selectCoinIds(address, coinTypeB, bigAmountB),
    ]);

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

    txb.moveCall({
      target: `${contract.packageId}::position_manager::mint`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
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
        txb.pure(this.getMinimumAmount(bigAmountA, fields.fee, slippage), 'u64'),
        txb.pure(this.getMinimumAmount(bigAmountB, fields.fee, slippage), 'u64'),
        // recipient
        txb.object(address),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE, '128'),
        // ctx
        txb.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    return signAndExecute(txb);
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

  protected getPoolTypeArguments(type: string): [string, string, string] {
    const matched = type.match(/(\w+::\w+::\w+)/g);
    if (!matched || matched.length !== 4) {
      throw new Error('Invalid pool type');
    }
    return [matched[1]!, matched[2]!, matched[3]!];
  }
}

export interface PoolFields {
  coin_a: string;
  coin_b: string;
  deploy_time_ms: string;
  fee: number;
  fee_growth_global_a: string;
  fee_growth_global_b: string;
  fee_protocol: number;
  id: { id: string };
  liquidity: string;
  max_liquidity_per_tick: string;
  protocol_fees_a: string;
  protocol_fees_b: string;
  reward_infos: any[];
  reward_last_updated_time_ms: string;
  sqrt_price: string;
  tick_current_index: {
    type: string;
    fields: { bits: number };
  };
  tick_map: {
    type: string;
    fields: {
      id: { id: string };
      size: string;
    };
  };
  tick_spacing: number;
  unlocked: boolean;
  version: string;
}
