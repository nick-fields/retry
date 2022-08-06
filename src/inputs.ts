import { getInput, error, warning, info, debug, setOutput } from '@actions/core';
import ms from 'milliseconds';

interface TimeoutInputs {
  timeoutMinutes: number | undefined;
  timeoutSeconds: number | undefined;
}

export function getInputNumber(id: string, required: boolean): number | undefined {
  const input = getInput(id, { required });
  const num = Number.parseInt(input);

  // empty is ok
  if (!input && !required) {
    return;
  }

  if (!Number.isInteger(num)) {
    throw `Input ${id} only accepts numbers.  Received ${input}`;
  }

  return num;
}

export function getInputBoolean(id: string): boolean {
  const input = getInput(id);

  if (!['true', 'false'].includes(input.toLowerCase())) {
    throw `Input ${id} only accepts boolean values.  Received ${input}`;
  }
  return input.toLowerCase() === 'true';
}

export async function validateInputs(inputs: TimeoutInputs) {
  if (
    (!inputs.timeoutMinutes && !inputs.timeoutSeconds) ||
    (inputs.timeoutMinutes && inputs.timeoutSeconds)
  ) {
    throw new Error('Must specify either timeout_minutes or timeout_seconds inputs');
  }
}

export function getTimeout(inputs: TimeoutInputs): number {
  if (inputs.timeoutMinutes) {
    return ms.minutes(inputs.timeoutMinutes);
  } else if (inputs.timeoutSeconds) {
    return ms.seconds(inputs.timeoutSeconds);
  }

  throw new Error('Must specify either timeout_minutes or timeout_seconds inputs');
}
