import { Ed25519Keypair } from '@mysten/sui.js';

export declare module Account {
  export interface DerivePathParams {
    accountIndex?: number;
    isExternal?: boolean;
    addressIndex?: number;
  }
}

export class Account {
  public getKeypairFromMnemonics(mnemonics: string, path: Account.DerivePathParams = {}) {
    const derivePath = this.getDerivePath(path);
    return Ed25519Keypair.deriveKeypair(mnemonics, derivePath);
  }

  protected getDerivePath(path: Account.DerivePathParams = {}) {
    const { accountIndex = 0, isExternal = false, addressIndex = 0 } = path;
    return `m/44'/784'/${accountIndex}'/${isExternal ? 1 : 0}'/${addressIndex}'`;
  }
}
