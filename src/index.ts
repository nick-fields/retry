import { getInput, error, warning, info, debug, setOutput } from '@actions/core';
import { exec, execSync } from 'child_process';
import ms from 'milliseconds';
import kill from 'tree-kill';

import { wait } from './util';

// inputs
const TIMEOUT_MINUTES = getInputNumber('timeout_minutes', false);
const TIMEOUT_SECONDS = getInputNumber('timeout_seconds', false);
const MAX_ATTEMPTS = getInputNumber('max_attempts', true) || 3;
const COMMAND = getInput('command', { required: true });
const RETRY_WAIT_SECONDS = getInputNumber('retry_wait_seconds', false) || 10;
const SHELL = getInput('shell');
const POLLING_INTERVAL_SECONDS = getInputNumber('polling_interval_seconds', false) || 1;
const RETRY_ON = getInput('retry_on') || 'any';
const WARNING_ON_RETRY = getInput('warning_on_retry').toLowerCase() === 'true';
const ON_RETRY_COMMAND = getInput('on_retry_command');
const CONTINUE_ON_ERROR = getInputBoolean('continue_on_error');
const NEW_COMMAND_ON_RETRY = getInput('new_command_on_retry');
const RETRY_ON_EXIT_CODE = getInputNumber('retry_on_exit_code', false);

const OS = process.platform;
const OUTPUT_TOTAL_ATTEMPTS_KEY = 'total_attempts';
const OUTPUT_EXIT_CODE_KEY = 'exit_code';
const OUTPUT_EXIT_ERROR_KEY = 'exit_error';

var exit: number;
var done: boolean;

function getInputNumber(id: string, required: boolean): number | undefined {
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

function getInputBoolean(id: string): Boolean {
  const input = getInput(id);

  if (!['true','false'].includes(input.toLowerCase())) {
    throw `Input ${id} only accepts boolean values.  Received ${input}`;
  }
  return input.toLowerCase() === 'true'
}

async function retryWait() {
  const waitStart = Date.now();
  await wait(ms.seconds(RETRY_WAIT_SECONDS));
  debug(`Waited ${Date.now() - waitStart}ms`);
  debug(`Configured wait: ${ms.seconds(RETRY_WAIT_SECONDS)}ms`);
}

async function validateInputs() {
  if ((!TIMEOUT_MINUTES && !TIMEOUT_SECONDS) || (TIMEOUT_MINUTES && TIMEOUT_SECONDS)) {
    throw new Error('Must specify either timeout_minutes or timeout_seconds inputs');
  }
}

function getTimeout(): number {
  if (TIMEOUT_MINUTES) {
    return ms.minutes(TIMEOUT_MINUTES);
  } else if (TIMEOUT_SECONDS) {
    return ms.seconds(TIMEOUT_SECONDS);
  }

  throw new Error('Must specify either timeout_minutes or timeout_seconds inputs');
}

function getExecutable(): string {
  if (!SHELL) {
    return OS === 'win32' ? 'powershell' : 'bash';
  }

  let executable: string;
  switch (SHELL) {
    case "bash":
    case "python":
    case "pwsh": {
      executable = SHELL;
      break;
    }
    case "sh": {
      if (OS === 'win32') {
        throw new Error(`Shell ${SHELL} not allowed on OS ${OS}`);
      }
      executable = SHELL;
      break;
    }
    case "cmd":
    case "powershell": {
      if (OS !== 'win32') {
        throw new Error(`Shell ${SHELL} not allowed on OS ${OS}`);
      }
      executable = SHELL + ".exe";
      break;
    }
    default: {
      throw new Error(`Shell ${SHELL} not supported.  See https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions#using-a-specific-shell for supported shells`);
    }
  }
  return executable
}

async function runRetryCmd(): Promise<void> {
  // if no retry script, just continue
  if (!ON_RETRY_COMMAND) {
    return;
  }

  try {
    await execSync(ON_RETRY_COMMAND, { stdio: 'inherit' });
  } catch (error) {
    info(`WARNING: Retry command threw the error ${error.message}`)
  }
}

async function runCmd(attempt: number) {
  const end_time = Date.now() + getTimeout();
  const executable = getExecutable();

  exit = 0;
  done = false;

  debug(`Running command ${COMMAND} on ${OS} using shell ${executable}`)
  var child = attempt > 1 && NEW_COMMAND_ON_RETRY
      ? exec(NEW_COMMAND_ON_RETRY, { 'shell': executable })
      : exec(COMMAND, { 'shell': executable });

  child.stdout?.on('data', (data) => {
    process.stdout.write(data);
  });
  child.stderr?.on('data', (data) => {
    process.stdout.write(data);
  });

  child.on('exit', (code, signal) => {
    debug(`Code: ${code}`);
    debug(`Signal: ${signal}`);
    if (code && code > 0) {
      exit = code;
    }
    // timeouts are killed manually
    if (signal === 'SIGTERM') {
      return;
    }
    done = true;
  });

  do {
    await wait(ms.seconds(POLLING_INTERVAL_SECONDS));
  } while (Date.now() < end_time && !done);

  if (!done) {
    kill(child.pid);
    await retryWait();
    throw new Error(`Timeout of ${getTimeout()}ms hit`);
  } else if (exit > 0) {
    await retryWait();
    throw new Error(`Child_process exited with error code ${exit}`);
  } else {
    return;
  }
}

async function runAction() {
  await validateInputs();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // just keep overwriting attempts output
      setOutput(OUTPUT_TOTAL_ATTEMPTS_KEY, attempt);
      await runCmd(attempt);
      info(`Command completed after ${attempt} attempt(s).`);
      if !(RETRY_ON === 'success') {
        break;
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Final attempt failed. ${error.message}`);
      } else if (!done && RETRY_ON === 'error') {
        // error: timeout
        throw error;
      } else if (RETRY_ON_EXIT_CODE && RETRY_ON_EXIT_CODE !== exit){
        throw error;
      } else if (exit > 0 && RETRY_ON === 'timeout') {
        // error: error
        throw error;
      } else {
        await runRetryCmd();
        if (WARNING_ON_RETRY) {
          warning(`Attempt ${attempt} failed. Reason: ${error.message}`);
        } else {
          info(`Attempt ${attempt} failed. Reason: ${error.message}`);
        }
      }
    }
  }
}

runAction()
  .then(() => {
    setOutput(OUTPUT_EXIT_CODE_KEY, 0);
    process.exit(0); // success
  })
  .catch((err) => {
    // exact error code if available, otherwise just 1
    const exitCode = exit > 0 ? exit : 1;

    if (CONTINUE_ON_ERROR) {
      warning(err.message);
    } else {
      error(err.message);
    }

    // these can be  helpful to know if continue-on-error is true
    setOutput(OUTPUT_EXIT_ERROR_KEY, err.message);
    setOutput(OUTPUT_EXIT_CODE_KEY, exitCode);

    // if continue_on_error, exit with exact error code else exit gracefully
    // mimics native continue-on-error that is not supported in composite actions
    process.exit(CONTINUE_ON_ERROR ? 0 : exitCode);
  });
