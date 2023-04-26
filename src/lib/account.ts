import { Ed25519Keypair, type Keypair } from '@mysten/sui.js';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export declare module Account {
  export interface DerivePathParams {
    accountIndex?: number;
    isExternal?: boolean;
    addressIndex?: number;
  }
}

export class Account {
  public generateMnemonic(numberOfWords: 12 | 24 = 24): string {
    return generateMnemonic(wordlist, numberOfWords === 12 ? 128 : 256);
  }

  public getKeypairFromMnemonics(
    mnemonics: string,
    path: Account.DerivePathParams = {},
  ): Keypair {
    const derivePath = this.getDerivePath(path);
    return Ed25519Keypair.deriveKeypair(mnemonics, derivePath);
  }

  protected getDerivePath(path: Account.DerivePathParams = {}) {
    const { accountIndex = 0, isExternal = false, addressIndex = 0 } = path;
    return `m/44'/784'/${accountIndex}'/${isExternal ? 1 : 0}'/${addressIndex}'`;
  }
}
