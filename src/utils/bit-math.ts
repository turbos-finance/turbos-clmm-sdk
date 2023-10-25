import BN from 'bn.js';

const ZERO = new BN(0);
const ONE = new BN(1);
const TWO = new BN(2);

export const bitMath = {
  mul(n0: BN, n1: BN, limit: number): BN {
    const result = n0.mul(n1);
    if (this.isOverLimit(result, limit)) {
      throw new Error(`Mul result higher than u${limit}`);
    }
    return result;
  },
  mulDiv(n0: BN, n1: BN, d: BN, limit: number): BN {
    return this.mulDivRoundUpIf(n0, n1, d, false, limit);
  },
  mulDivRoundUpIf(n0: BN, n1: BN, d: BN, roundUp: boolean, limit: number): BN {
    if (d.eq(ZERO)) {
      throw new Error('mulDiv denominator is zero');
    }

    const p = this.mul(n0, n1, limit);
    const n = p.div(d);

    return roundUp && p.mod(d).gt(ZERO) ? n.add(ONE) : n;
  },
  isOverLimit(n0: BN, limit: number) {
    const limitBN = TWO.pow(new BN(limit)).sub(ONE);
    return n0.gt(limitBN);
  },
};
