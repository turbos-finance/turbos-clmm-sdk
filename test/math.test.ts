import Decimal from 'decimal.js';
import { MathUtil } from '../src/lib/math';

const math = new MathUtil();

test('priceToSqrtPriceX64 and sqrtPriceX64ToPrice', () => {
  expect(math.priceToSqrtPriceX64(new Decimal('2'), 0, 0).toString()).toBe(
    '26087635650665564425',
  );

  const bn = math.priceToSqrtPriceX64(new Decimal('1.4404877207609194519'), 0, 0);
  const decimal = math.sqrtPriceX64ToPrice(bn, 0, 0);
  expect(bn.toString()).toBe('22139841262779494907');
  expect(decimal.toString()).toBe('1.4404877207609194519');
});

test('priceToTickIndex', () => {
  expect(
    math.priceToTickIndex(new Decimal('1.4404877207609194519'), 0, 0).toString(),
  ).toBe('3650');
  expect(
    math.priceToTickIndex(new Decimal('1883.0027237193456001'), 0, 0).toString(),
  ).toBe('75409');
});
