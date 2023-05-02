import {
  TransactionBlock,
  JsonRpcProvider,
  SuiAddress,
  SuiTransactionBlockResponse,
  TransactionArgument,
  SUI_CLOCK_OBJECT_ID,
  PaginatedCoins,
  getObjectType,
} from '@mysten/sui.js';
import Decimal from 'decimal.js';
import { Contract } from './contract';
import { validateObjectResponse } from '../utils/validate-object-response';
import { Base } from './base';

const ONE_MINUTE = 60 * 1000;

export declare module Pool {
  export interface MintParams {
    amount: [a: number | string, b: number | string];
    /**
     * Acceptable wasted amount. Range: `[0, 100)`, unit: `%`
     */
    slippage: number | string | Decimal;
    /**
     * Execute transaction by signer
     * ```typescript
     * import { RawSigner } from '@mysten/sui.js';
     * {
     *   signAndExecute(txb, provider) {
     *     const mnemonic = sdk.account.generateMnemonic(); // OR from your own
     *     const keypair = sdk.account.getKeypairFromMnemonics(mnemonic);
     *     const signer = new RawSigner(keypair, provider);
     *     return signer.signAndExecuteTransactionBlock(txb);
     *   },
     * }
     * ```
     * @see RawSigner
     */
    signAndExecute: (
      txb: TransactionBlock,
      provider: JsonRpcProvider,
    ) => Promise<SuiTransactionBlockResponse>;
  }

  export interface LiquidityParams {
    address: SuiAddress;
    minPrice: number | string | Decimal;
    maxPrice: number | string | Decimal;
  }

  export interface CreatePoolOptions extends MintParams, LiquidityParams {
    /**
     * Fee object from `sdk.contract.getFees()`
     */
    fee: Contract.Fee;
    /**
     * Coin type such as `0x2::sui::SUI`
     */
    coins: [a: string, b: string];
    currentPrice: number | string | Decimal;
  }

  export interface AddLiquidityOptions extends MintParams, LiquidityParams {
    /**
     * Pool ID
     */
    pool: string;
  }

  export interface IncreaseLiquidityOptions extends MintParams {
    /**
     * NFT ID
     */
    nft: string;
  }

  export interface DecreaseLiquidityOptions extends MintParams {
    /**
     * NFT ID
     */
    nft: string;
  }

  /**
   * Pool fields from `provider.getObject()` while turning on `showContent` option.
   */
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
}

export class Pool extends Base {
  async createPool(
    options: Pool.CreatePoolOptions,
  ): Promise<SuiTransactionBlockResponse> {
    const {
      fee,
      address,
      minPrice,
      maxPrice,
      currentPrice,
      slippage,
      signAndExecute,
      amount,
      coins,
    } = options;
    const contract = this.contract.config;
    const [coinTypeA, coinTypeB] = coins;
    const [amountA, amountB] = amount;
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
          objects: this.wrapCoin(txb, coinIdsA, coinTypeA, bigAmountA),
        }),
        txb.makeMoveVec({
          objects: this.wrapCoin(txb, coinIdsB, coinTypeB, bigAmountB),
        }),
        // tick_lower_index
        txb.pure(Math.abs(minTick).toFixed(0), 'u32'),
        txb.pure(minTick < 0, 'bool'),
        // tick_upper_index
        txb.pure(Math.abs(maxTick).toFixed(0), 'u32'),
        txb.pure(maxTick < 0, 'bool'),
        // amount_desired
        txb.pure(bigAmountA.toString(), 'u64'),
        txb.pure(bigAmountB.toString(), 'u64'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(bigAmountA, slippage).toFixed(0), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(bigAmountB, slippage).toFixed(0), 'u64'),
        // recipient
        txb.object(address),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    return signAndExecute(txb, this.provider);
  }

  async addLiquidity(
    options: Pool.AddLiquidityOptions,
  ): Promise<SuiTransactionBlockResponse> {
    const {
      address,
      amount: [amountA, amountB],
      minPrice,
      maxPrice,
      slippage,
      signAndExecute,
      pool,
    } = options;
    const contract = this.contract.config;
    const poolObject = await this.getPoolObjectWithType(pool);
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
          objects: this.wrapCoin(txb, coinIdsA, coinTypeA, bigAmountA),
        }),
        txb.makeMoveVec({
          objects: this.wrapCoin(txb, coinIdsB, coinTypeB, bigAmountB),
        }),
        // tick_lower_index
        txb.pure(Math.abs(minTick).toFixed(0), 'u32'),
        txb.pure(minTick < 0, 'bool'),
        // tick_upper_index
        txb.pure(Math.abs(maxTick).toFixed(0), 'u32'),
        txb.pure(maxTick < 0, 'bool'),
        // amount_desired
        txb.pure(bigAmountA.toString(), 'u64'),
        txb.pure(bigAmountB.toString(), 'u64'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(bigAmountA, slippage), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(bigAmountB, slippage), 'u64'),
        // recipient
        txb.object(address),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    return signAndExecute(txb, this.provider);
  }

  async increaseLiquidity(options: Pool.IncreaseLiquidityOptions) {
    const {
      amount: [amountA, amountB],
      slippage,
      nft,
      signAndExecute,
    } = options;
    const contract = this.contract.config;
    const [{ pool_id: pool }, address] = await Promise.all([
      this.nft.getFields(nft),
      this.nft.getOwner(nft),
    ]);
    const poolObject = await this.getPoolObjectWithType(pool);
    const typeArguments = this.getPoolTypeArguments(getObjectType(poolObject)!);
    const coinTypeA = typeArguments[0];
    const coinTypeB = typeArguments[1];
    const [coinA, coinB] = await Promise.all([
      this.provider.getCoinMetadata({ coinType: coinTypeA }),
      this.provider.getCoinMetadata({ coinType: coinTypeB }),
    ]);
    const bigAmountA = this.math.scaleUp(amountA, coinA.decimals);
    const bigAmountB = this.math.scaleUp(amountB, coinB.decimals);
    const [coinIdsA, coinIdsB] = await Promise.all([
      this.selectCoinIds(address!, coinTypeA, bigAmountA),
      this.selectCoinIds(address!, coinTypeB, bigAmountB),
    ]);

    const txb = new TransactionBlock();
    txb.moveCall({
      target: `${contract.packageId}::position_manager::increase_liquidity`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.positions),
        // coins
        txb.makeMoveVec({
          objects: this.wrapCoin(txb, coinIdsA, coinTypeA, bigAmountA),
        }),
        txb.makeMoveVec({
          objects: this.wrapCoin(txb, coinIdsB, coinTypeB, bigAmountB),
        }),
        // nft
        txb.object(nft),
        // amount_desired
        txb.pure(bigAmountA.toString(), 'u64'),
        txb.pure(bigAmountB.toString(), 'u64'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(bigAmountA, slippage), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(bigAmountB, slippage), 'u64'),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE * 3, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return signAndExecute(txb, this.provider);
  }

  async decreaseLiquidity(
    options: Pool.DecreaseLiquidityOptions,
  ): Promise<SuiTransactionBlockResponse> {
    const {
      amount: [amountA, amountB],
      slippage,
      nft,
      signAndExecute,
    } = options;
    const contract = this.contract.config;
    const [{ pool_id: pool }, { liquidity }] = await Promise.all([
      this.nft.getFields(nft),
      this.nft.getPositionFields(nft),
    ]);
    const poolObject = await this.getPoolObjectWithType(pool);
    const typeArguments = this.getPoolTypeArguments(getObjectType(poolObject)!);
    const coinTypeA = typeArguments[0];
    const coinTypeB = typeArguments[1];
    const [coinA, coinB] = await Promise.all([
      this.provider.getCoinMetadata({ coinType: coinTypeA }),
      this.provider.getCoinMetadata({ coinType: coinTypeB }),
    ]);
    const bigAmountA = this.math.scaleUp(amountA, coinA.decimals);
    const bigAmountB = this.math.scaleUp(amountB, coinB.decimals);

    const txb = new TransactionBlock();
    txb.moveCall({
      target: `${contract.packageId}::position_manager::decrease_liquidity`,
      typeArguments: typeArguments,
      arguments: [
        // pool
        txb.object(pool),
        // positions
        txb.object(contract.positions),
        // nft
        txb.object(nft),
        // liquidity
        txb.pure(liquidity, 'u128'),
        // amount_min
        txb.pure(this.getMinimumAmountBySlippage(bigAmountA, slippage), 'u64'),
        txb.pure(this.getMinimumAmountBySlippage(bigAmountB, slippage), 'u64'),
        // deadline
        txb.pure(Date.now() + ONE_MINUTE * 3, 'u64'),
        // clock
        txb.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return signAndExecute(txb, this.provider);
  }

  protected getMinimumAmountBySlippage(
    amount: number | string | Decimal,
    slippage: number | string | Decimal,
  ): Decimal {
    const origin = new Decimal(amount);
    const ratio = new Decimal(1).minus(new Decimal(slippage).div(100));
    if (ratio.lte(0) || ratio.gt(1)) {
      throw new Error('invalid slippage range');
    }
    return origin.mul(ratio);
  }

  protected async selectCoinIds(
    owner: SuiAddress,
    coinType: string,
    expectedAmount: Decimal,
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
      if (totalAmount.gte(expectedAmount)) {
        break;
      }
    }
    return coinIds;
  }

  protected wrapCoin(
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

  protected async getPoolObjectWithType(poolId: string) {
    const poolObject = await this.provider.getObject({
      id: poolId,
      options: { showType: true },
    });
    validateObjectResponse(poolObject, 'pool');
    return poolObject;
  }

  protected getPoolTypeArguments(type: string): [string, string, string] {
    const matched = type.match(/(\w+::\w+::\w+)/g);
    if (!matched || matched.length !== 4) {
      throw new Error('Invalid pool type');
    }
    return [matched[1]!, matched[2]!, matched[3]!];
  }
}
