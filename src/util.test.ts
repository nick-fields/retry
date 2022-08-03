import 'jest';
import { getHeapStatistics } from 'v8';

import { wait } from './util';

// mocks the setTimeout function, see https://jestjs.io/docs/timer-mocks
jest.useFakeTimers();
jest.spyOn(global, 'setTimeout');

describe('util', () => {
  test('wait', async () => {
    const waitTime = 1000;
    wait(waitTime);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), waitTime);
  });
});
