import { LRUCache } from 'lru-cache';
import type { TurbosSdk } from '../sdk';

export class Base {
  private _lru: LRUCache<{}, {}, unknown> | undefined;
  private _fetching: Record<string, Promise<any>> = {};

  constructor(protected readonly sdk: TurbosSdk) {}

  protected async getCacheOrSet<T>(
    key: string,
    orSet: () => Promise<T>,
    durationMS: number = 0,
  ): Promise<T> {
    const cache = (this._lru ||= new LRUCache({
      max: 100,
    }));
    if (cache.has(key)) {
      return cache.get(key) as T;
    }
    const promise = (this._fetching[key] ||= orSet());
    const result = await promise;
    delete this._fetching[key];
    cache.set(key, result!, { ttl: durationMS });
    return result;
  }

  protected get provider() {
    return this.sdk.provider;
  }

  protected get math() {
    return this.sdk.math;
  }

  protected get account() {
    return this.sdk.account;
  }

  protected get network() {
    return this.sdk.network;
  }

  protected get contract() {
    return this.sdk.contract;
  }

  /**
   * @deprecated use position instead
   */
  protected get nft() {
    return this.sdk.nft;
  }

  protected get position() {
    return this.sdk.position;
  }

  protected get coin() {
    return this.sdk.coin;
  }

  protected get trade() {
    return this.sdk.trade;
  }

  protected get pool() {
    return this.sdk.pool;
  }
}
