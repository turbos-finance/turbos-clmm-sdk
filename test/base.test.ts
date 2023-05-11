import sleep from 'sleep-promise';
import { Base } from '../src/lib/base';
import { createSdk } from './helper/create-sdk';

const sdk = createSdk();

test('get cache or set', async () => {
  class Test extends Base {
    async testMe() {
      const result = await this.getCacheOrSet('test1', async () => {
        return '20';
      });
      return result;
    }
  }
  await expect(new Test(sdk).testMe()).resolves.toBe('20');
});

test('concurrency get cache', async () => {
  const spy = vitest.fn();
  class Test extends Base {
    async testMe() {
      const result = await this.getCacheOrSet('test1', async () => {
        spy();
        await sleep(100);
        return '20';
      });
      return result;
    }
  }
  const instance = new Test(sdk);
  const promise = instance.testMe();
  instance.testMe();
  expect(instance['_fetching']).toHaveProperty('test1');
  expect(spy).toBeCalledTimes(1);
  await promise;
  expect(instance['_fetching']).not.toHaveProperty('test1');
  expect(spy).toBeCalledTimes(1);
  await instance.testMe();
  expect(spy).toBeCalledTimes(1);
});

test('time to live', async () => {
  let count = 0;
  class Test extends Base {
    async testMe() {
      const result = await this.getCacheOrSet(
        'test1',
        async () => {
          return ++count;
        },
        100,
      );
      return result;
    }
  }
  const instance = new Test(sdk);
  await expect(instance.testMe()).resolves.toBe(1);
  await expect(instance.testMe()).resolves.toBe(1);
  await sleep(110);
  await expect(instance.testMe()).resolves.toBe(2);
});
