import { debug } from '@actions/core';
import ms from 'milliseconds';
import { Inputs } from './inputs';

export async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function retryWait(inputs: Inputs) {
  if (inputs.retry_wait_strategy === 'random') {
    debug('Using random wait strategy');
    const waitSecondsMin = ms.seconds(inputs.retry_wait_seconds_min);
    const waitSecondsMax = ms.seconds(inputs.retry_wait_seconds_max);
    await retryWaitConstant(
      ms.seconds(Math.random() * (waitSecondsMax - waitSecondsMin) + waitSecondsMin)
    );
    debug(
      `Configured wait random between  ${inputs.retry_wait_seconds_min}s and ${inputs.retry_wait_seconds_max}s`
    );
    return;
  }

  debug('Using fixed wait strategy');
  const retryWaitSeconds = ms.seconds(inputs.retry_wait_seconds);
  await retryWaitConstant(retryWaitSeconds);
  debug(`Configured wait: ${inputs.retry_wait_seconds}s`);
}

export async function retryWaitConstant(retryWaitMs: number) {
  const waitStart = Date.now();
  await wait(retryWaitMs);
  debug(`Waited ${Date.now() - waitStart}ms`);
}
