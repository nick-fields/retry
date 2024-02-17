// Copyright 2024 The Oppia Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Action implementation.
 */
import { error, info, debug } from '@actions/core';

import { Inputs } from './inputs';
import { spawn } from 'child_process';
import ms from 'milliseconds';

const OS = process.platform;

function getExecutable(): string {
  return OS === 'win32' ? 'powershell' : 'bash';
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface CommandResult {
  success: boolean;
  exitCode: number;
  output: string[];
}

async function runCommand(inputs: Inputs): Promise<CommandResult> {
  const endTime = Date.now() + ms.hours(5);
  const executable = getExecutable();

  // Timeout exit code - 124
  let exitCode = 124;
  let done = false;
  const output: string[] = [];

  debug(`Running command ${inputs.command} on ${OS} using shell ${executable}`);
  const child = spawn(inputs.command, { shell: executable });

  child.stdout?.on('data', (data) => {
    process.stdout.write(data);
    output.push(data);
  });
  child.stderr?.on('data', (data) => {
    process.stdout.write(data);
    output.push(data);
  });

  child.on('exit', (code) => {
    debug(`Code: ${code}`);

    if (code === null) {
      error('exit code cannot be null');
      exitCode = 1;
      return;
    }

    exitCode = code;
    done = true;
  });

  do {
    const pollingPeriod = ms.seconds(1);
    await wait(pollingPeriod);
  } while (Date.now() < endTime && !done);

  return {
    success: exitCode === 0,
    exitCode,
    output,
  };
}

function hasFlakyOutput(
  substrings_indicating_flaky_execution: string[],
  output: string[]
): boolean {
  const flakyIndicator = substrings_indicating_flaky_execution.find((flakyLine) =>
    output.some((outputLine) => outputLine.includes(flakyLine))
  );
  if (flakyIndicator === undefined) {
    return false;
  }
  info(`Found flaky indicator: ${flakyIndicator}`);
  return true;
}

export async function runAction(inputs: Inputs): Promise<number> {
  for (let attempt = 1; attempt <= inputs.maxAttempts; attempt++) {
    info(`Starting attempt #${attempt}`);
    const { success, exitCode, output } = await runCommand(inputs);
    if (success) {
      info(`Attempt #${attempt} succeeded`);
      return 0;
    }

    info(`Attempt #${attempt} failed with exit code ${exitCode}`);
    if (attempt == inputs.maxAttempts) {
      return exitCode;
    }

    if (!hasFlakyOutput(inputs.substringsIndicatingFlakyExecution, output)) {
      info("Output doesn't contain flaky indicators, considering it a failure");
      return exitCode;
    }
    info('Output contains flaky indicators, restarting the test');
  }
  throw new Error('Unreachable');
}
