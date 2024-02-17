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
 * @fileoverview Retry action test.
 */

import 'jest';

import { runAction } from './action';
import { Inputs } from './inputs';
import * as fs from 'fs';

function generateRandomString(length: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * letters.length);
    result += letters.charAt(randomIndex);
  }

  return result;
}

function createTempFile(content = ''): string {
  const fileName = `/tmp/${generateRandomString(10)}`;
  fs.writeFileSync(fileName, content);
  return fileName;
}

function assertFileContent(fileName: string, content: string) {
  const data = fs.readFileSync(fileName, 'utf-8');
  expect(data).toBe(content);
}

describe('retry', () => {
  let fileName = '';
  beforeEach(() => {
    fileName = createTempFile();
  });

  it('retries, fails', async () => {
    const inputs: Inputs = {
      maxAttempts: 3,
      command: `echo 'a line for a flake test' \\
                  && echo -n 1 >> ${fileName} \\
                  && false`,
      substringsIndicatingFlakyExecution: ['another_flake', 'flake'],
    };
    const exitCode = await runAction(inputs);
    expect(exitCode).toBe(1);

    assertFileContent(fileName, '111');
  });

  it('succeeds', async () => {
    const inputs: Inputs = {
      maxAttempts: 3,
      command: `echo -n 1 >> ${fileName}`,
      substringsIndicatingFlakyExecution: ['flake'],
    };
    const exitCode = await runAction(inputs);
    expect(exitCode).toBe(0);

    assertFileContent(fileName, '1');
  });

  it('succeeds with empty flaky lines', async () => {
    const inputs: Inputs = {
      maxAttempts: 3,
      command: `echo -n 1 >> ${fileName}`,
      substringsIndicatingFlakyExecution: [],
    };
    const exitCode = await runAction(inputs);
    expect(exitCode).toBe(0);

    assertFileContent(fileName, '1');
  });

  it('succeeds after flake', async () => {
    const inputs: Inputs = {
      maxAttempts: 3,
      // command succeeds on the second run
      command: `echo flake \\
                  && echo -n 1 >> ${fileName} \\
                  && grep 11 ${fileName}`,
      substringsIndicatingFlakyExecution: ['flake'],
    };
    const exitCode = await runAction(inputs);
    expect(exitCode).toBe(0);

    assertFileContent(fileName, '11');
  });

  it('detects real errors based on output', async () => {
    const inputs: Inputs = {
      maxAttempts: 3,
      command: `echo -n 1 >> ${fileName} \\
                  && echo 'real error, not flaky' \\
                  && false`,
      substringsIndicatingFlakyExecution: ['flaky_string'],
    };
    const exitCode = await runAction(inputs);
    expect(exitCode).toBe(1);

    assertFileContent(fileName, '1');
  });

  it('detects real errors after flakes', async () => {
    // The second file is used to indicate the flake.
    const secondFileName = createTempFile('flaky_string');
    const inputs: Inputs = {
      maxAttempts: 3,
      // The first execution will output "flaky_string".
      // The second execution will output "1"
      // because we overwrite the second file with "1" during the first execution.
      // The second execution should not be treated as a flake.
      command: `cat ${secondFileName} \\
                  && echo 1 > ${secondFileName} \\
                  && echo -n 1 >> ${fileName} \\
                  && false`,
      substringsIndicatingFlakyExecution: ['flaky_string'],
    };
    const exitCode = await runAction(inputs);
    expect(exitCode).toBe(1);

    // assert executed only twice
    assertFileContent(fileName, '11');
    fs.unlinkSync(secondFileName);
  });

  afterEach(() => {
    fs.unlinkSync(fileName);
  });
});
