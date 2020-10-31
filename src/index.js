const { getInput, error, warning, info, debug, setOutput } = require('@actions/core');
const child_process = require('child_process');
const { join } = require('path');
const ms = require('milliseconds');
var kill = require('tree-kill');

// inputs
const TIMEOUT_MINUTES = getInputNumber('timeout_minutes', false);
const TIMEOUT_SECONDS = getInputNumber('timeout_seconds', false);
const MAX_ATTEMPTS = getInputNumber('max_attempts', true);
const COMMAND = getInput('command', { required: true });
const RETRY_WAIT_SECONDS = getInputNumber('retry_wait_seconds', false);
const POLLING_INTERVAL_SECONDS = getInputNumber('polling_interval_seconds', false);
const RETRY_ON = getInput('retry_on') || 'any';

const OUTPUT_TOTAL_ATTEMPTS_KEY = 'total_attempts';
const OUTPUT_EXIT_CODE_KEY = 'exit_code';
const OUTPUT_EXIT_ERROR_KEY = 'exit_error';

var exit;
var done;

function getInputNumber(id, required) {
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

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

  if (TIMEOUT_SECONDS && TIMEOUT_SECONDS < RETRY_WAIT_SECONDS) {
    throw new Error(
      `timeout_seconds ${TIMEOUT_SECONDS}s less than retry_wait_seconds ${RETRY_WAIT_SECONDS}s`
    );
  }
}

function getTimeout() {
  if (TIMEOUT_MINUTES) {
    return ms.minutes(TIMEOUT_MINUTES);
  }

  return ms.seconds(TIMEOUT_SECONDS);
}

async function runCmd() {
  const end_time = Date.now() + getTimeout();

  exit = 0;
  done = false;

  const file = COMMAND.split(' ')[0];
  const args = COMMAND.split(' ').slice(1);

  var child = child_process.spawn(file, args, { stdio: 'inherit' });
  // var child = spawn('node', [join(__dirname, 'exec.js'), COMMAND], { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    debug(`Code: ${code}`);
    debug(`Signal: ${signal}`);
    if (code > 0) {
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
      await runCmd();
      info(`Command completed after ${attempt} attempt(s).`);
      break;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Final attempt failed. ${error.message}`);
      } else if (!done && RETRY_ON === 'error') {
        // error: timeout
        throw error;
      } else if (exit > 0 && RETRY_ON === 'timeout') {
        // error: error
        throw error;
      } else {
        warning(`Attempt ${attempt} failed. Reason: ${error.message}`);
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
    error(err.message);

    // these can be  helpful to know if continue-on-error is true
    setOutput(OUTPUT_EXIT_ERROR_KEY, err.message);
    setOutput(OUTPUT_EXIT_CODE_KEY, exit > 0 ? exit : 1);

    // exit with exact error code if available, otherwise just exit with 1
    process.exit(exit > 0 ? exit : 1);
  });
