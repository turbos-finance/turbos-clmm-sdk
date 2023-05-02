import type { TurbosSdk } from '../sdk';

export class Base {
  constructor(protected readonly sdk: TurbosSdk) {}

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

  protected get nft() {
    return this.sdk.nft;
  }
}
