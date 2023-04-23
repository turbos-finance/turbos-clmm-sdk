import { Ed25519Keypair } from '@mysten/sui.js';
import { Account } from '../src/account';

const account = new Account();

describe('mnemonic', () => {
  test('12 words', () => {
    const result = account.generateMnemonic(12);
    expect(result.split(' ')).toHaveLength(12);
  });

  test('24 words', () => {
    const result = account.generateMnemonic(24);
    expect(result.split(' ')).toHaveLength(24);
  });

  test('all english words', () => {
    expect(account.generateMnemonic()).toMatch(/^[a-z\s]+$/);
  });
});

describe('keypair', () => {
  const mnemonic =
    'element easy business emotion rib ahead deputy guess rocket fit post rough slush siren print ostrich smile minor piece leg minute cat render turtle';

  test('from mnemonic', () => {
    const keypair = account.getKeypairFromMnemonics(mnemonic);
    expect(keypair).instanceOf(Ed25519Keypair);
    expect(keypair.getPublicKey().toSuiAddress()).toBe(
      '0xe6ce2df166589140bce33517fc0e407baf2ab0d412c0c668edcfeb9fef5fb69b',
    );
  });

  test('from mnemonic with external', () => {
    const keypair = account.getKeypairFromMnemonics(mnemonic, { isExternal: true });
    expect(keypair.getPublicKey().toSuiAddress()).toBe(
      '0x145ad8ab92542ae8defd9545fdb81598a71be1ed88aff44f1770989176cf28c3',
    );
  });

  test('from mnemonic with bigger account index', () => {
    const keypair = account.getKeypairFromMnemonics(mnemonic, { accountIndex: 1 });
    expect(keypair.getPublicKey().toSuiAddress()).toBe(
      '0x9437205b104e077383933f57953788cd29961f5af8c197c7141fd49988939351',
    );
  });

  test('from mnemonic with bigger address index', () => {
    const keypair = account.getKeypairFromMnemonics(mnemonic, { addressIndex: 1 });
    expect(keypair.getPublicKey().toSuiAddress()).toBe(
      '0x62a16f30c25b44eb8317b909a593ea09d63c66d2a169a7c505f1d5c71b453a52',
    );
  });
});
