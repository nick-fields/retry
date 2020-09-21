const { getInput, error, warning, info, debug } = require('@actions/core');
const { spawn } = require('child_process');
const { join } = require('path');
const ms = require('milliseconds');
var kill = require('tree-kill');

function getInputNumber(id, required) {
  const input = getInput(id, { required });
  const num = Number.parseInt(input);

  if (!Number.isInteger(num)) {
    throw `Input ${id} only accepts numbers.  Received ${input}`;
  }

  return num;
}

// inputs
const TIMEOUT_MINUTES = getInputNumber('timeout_minutes', true);
const MAX_ATTEMPTS = getInputNumber('max_attempts', true);
const COMMAND = getInput('command', { required: true });
const RETRY_WAIT_SECONDS = getInputNumber('retry_wait_seconds', false);
const POLLING_INTERVAL_SECONDS = getInputNumber('polling_interval_seconds', false);
const RETRY_ON = getInput('retry_on') || 'both';

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

var exit;
var done;

async function runCmd() {
  const end_time = Date.now() + ms.minutes(TIMEOUT_MINUTES);

  exit = 0;
  done = false;

  var child = spawn('node', [join(__dirname, 'exec.js'), COMMAND], { stdio: 'inherit' });

  child.on('exit', (code) => {
    if (code > 0) {
      exit = code;
    }
    done = true;
  });

  do {
    await wait(ms.seconds(POLLING_INTERVAL_SECONDS));
  } while (Date.now() < end_time && !done);

  if (!done) {
    kill(child.pid);
    await retryWait();
    throw new Error(`Timeout of ${TIMEOUT_MINUTES}m hit`);
  } else if (exit > 0) {
    await retryWait();
    throw new Error(`Child_process exited with error code ${exit}`);
  } else {
    return;
  }
}

async function retryWait() {
  const waitStart = Date.now();
  await wait(ms.seconds(RETRY_WAIT_SECONDS));
  debug(`Waited ${Date.now() - waitStart}ms`);
  debug(`Configured wait: ${ms.seconds(RETRY_WAIT_SECONDS)}ms`);
}

async function runAction() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await runCmd();
      info(`Command completed after ${attempt} attempt(s).`);
      break;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Final attempt failed. ${error.message}`);
      } else if (!done && RETRY_ON == 'nonzero') {
        // error: timeout
        throw error;
      } else if (exit > 0 && RETRY_ON == 'timeout') {
        // error: nonzero
        throw error;
      } else {
        warning(`Attempt ${attempt} failed. Reason:`, error.message);
      }
    }
  }
}

runAction()
.then(() => {
  process.exit(0); // success
})
.catch((err) => {
  error(err.message);
  if (exit > 0) {
    // error: nonzero
    process.exit(exit); // copy exit code
  } else {
    // error: Final attempt failed or timeout
    process.exit(1);
  }
});
