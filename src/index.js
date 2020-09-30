const { getInput, error, warning, info, debug, setOutput } = require('@actions/core');
const { spawn } = require('child_process');
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
const HIDE_OUTPUT = Boolean(getInput('hide_output'));
const SHOW_STATS = Boolean(getInput('show_stats'));

const SAVE_LINES = [];
const ID_STDOUT = 0;
const ID_STDERR = 1;
const _save_lines_default = [10, 100];
const _save_lines =
  getInput('save_lines')
  .split(/\s+/)
  .map(s => parseInt(s, 10))
  .map(n => isNaN(n) ? Infinity : Math.abs(n));
for (const stream_id of [ID_STDOUT, ID_STDERR]) {
  SAVE_LINES[stream_id] =
    _save_lines[stream_id] == undefined
      ? _save_lines_default[stream_id]
      : _save_lines[stream_id];
}

const STATE_OK = 0;
const STATE_NONZERO = 1;
const STATE_TIMEOUT = 2;
const STATE_SIGTERM = 4;
const STATE_MAX_ATTEMPTS = 8;

const state_shortname = {};
state_shortname[STATE_OK] = 'OK';
state_shortname[STATE_NONZERO] = 'NonZero';
state_shortname[STATE_TIMEOUT] = 'TimeOut';
state_shortname[STATE_SIGTERM] = 'SigTerm';

const OUTPUT_TOTAL_ATTEMPTS_KEY = 'total_attempts';
const OUTPUT_EXIT_CODE_KEY = 'exit_code';
const OUTPUT_EXIT_ERROR_KEY = 'exit_error';
const OUTPUT_EXIT_STATE_KEY = 'exit_state';

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
  const time_zero = Date.now();

  let exit_code = -1; // -1 means undefined
  let cmd_done = false;

  let state = STATE_OK;
  let message = '';

  const cmd_output = [[], []];
  const num_lines = [0, 0]; // total number of output lines
  const last_line_done = [true, true];

  function result() {
    return {
      state,
      message,
      time_zero,
      time_delta: Date.now() - time_zero,
      cmd_output,
      last_line_done,
      num_lines,
      exit_code,
      cmd_done,
    };
  }

  // TODO why do we need both spawn + exec?
  var child = spawn('node', [join(__dirname, 'exec.js'), COMMAND], { stdio: 'inherit' });

  if (!HIDE_OUTPUT) {
    // show output
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }

  // save last lines of command output
  function handleData(chunk, stream_id) {
    // globals:
    // SAVE_LINES, time_zero, cmd_output,
    // last_line_done, num_lines

    const chunk_time = Date.now() - time_zero;
    const chunk_end_nl = chunk.slice(-1)[0] == '\n';
    const line_list = chunk.trim().split('\n');
    const out_lines = cmd_output[stream_id];

    if (!last_line_done[stream_id]) {
      // continue last line
      const first_line_str = line_list.shift();
      const last_line = out_lines[out_lines.length - 1];
      last_line[1] += first_line_str;
      if (chunk_end_nl) {
        last_line[1] += '\n';
        num_lines[stream_id]++;
        last_line_done[stream_id] = true;
      }
    }

    for (const line of line_list) {
      out_lines.push([ chunk_time, line+'\n' ]);
      num_lines[stream_id]++;
    }

    if (line_list.length > 0 && !chunk_end_nl) {
      // last line had no newline
      const last_line = out_lines[out_lines.length - 1];
      last_line[1] = last_line[1].slice(0, -1);
      last_line_done[stream_id] = false;
      num_lines[stream_id]--;
    }

    if (SAVE_LINES[stream_id] < Infinity) {
      let remove_lines = out_lines.length - SAVE_LINES[stream_id];
      while (remove_lines > 0) {
        out_lines.shift(); // remove first line
        remove_lines--;
      }
    }
  }

  // make the 'data' event return a string
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  if (SAVE_LINES[ID_STDOUT] > 0)
    child.stdout.on('data', chunk => handleData(chunk, ID_STDOUT));
  if (SAVE_LINES[ID_STDERR] > 0)
    child.stderr.on('data', chunk => handleData(chunk, ID_STDERR));
  // assert: events end/close on stdout/stderr fire before child exit

  child.on('exit', (code, signal) => {
    debug(`Code: ${code}`);
    debug(`Signal: ${signal}`);
    exit_code = code;
    // timeouts are killed manually
    if (signal === 'SIGTERM') {
      state = STATE_SIGTERM;
      message = 'Received signal Terminate';
      return result();
    }
    cmd_done = true;
  });

  do {
    await wait(ms.seconds(POLLING_INTERVAL_SECONDS));
  } while (Date.now() < end_time && !cmd_done);

  if (!cmd_done) {
    kill(child.pid);
    state = STATE_TIMEOUT;
    message = `Timeout of ${getTimeout()}ms hit`;
  } else if (exit_code > 0) {
    state = STATE_NONZERO;
    message = `Child_process exited with error code ${exit_code}`;
  }
  return result();
}

async function runAction() {
  await validateInputs();

  const result_list = [];

  function showStats() {
    if (SHOW_STATS) {
      info('\nRetry - Statistics:');
      info('  Attempt | Status  | RC | Time/ms | Out Lines | Err Lines');
      for (const [idx, result] of result_list.entries()) {
        const attempt = idx + 1;
        if (result) {
          info(
            '  ' +
            String(attempt).padStart(7, ' ') + ' | ' +
            state_shortname[result.state].padStart(7, ' ') + ' | ' +
            String(result.exit_code).padStart(2, ' ') + ' | ' +
            String(result.time_delta).padStart(7, ' ') + ' | ' +
            String(result.num_lines[ID_STDOUT]).padStart(9, ' ') + ' | ' +
            String(result.num_lines[ID_STDERR]).padStart(9, ' ')
          );
        } else {
          info('  ' + String(attempt).padStart(7, ' ') + ' | no result');
        }
      }
    }

    if (SAVE_LINES[ID_STDOUT] > 0 || SAVE_LINES[ID_STDERR] > 0) {
      info('\nRetry - Last Lines of Command Output:');
      for (const [idx, result] of result_list.entries()) {
        const attempt = idx + 1;
        if (result) {
          info(`\nAttempt ${attempt}:`);
          // merge stdout + stderr arrays
          result.cmd_output[ID_STDOUT].map(i => [ID_STDOUT, ...i])
            .concat(result.cmd_output[ID_STDERR].map(i => [ID_STDERR, ...i]))
            .sort((a, b) => a[1] - b[1]) // sort by time
            .forEach(([stream_id, time, line]) => {
              const print = stream_id == ID_STDOUT ? info : error;
              print(
                String(time).padStart(7, ' ') + ' ' +
                line.trim()
              );
            });
        }
        else {
          info(`\nAttempt ${attempt}: no result`);
        }
      }
    }
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // just keep overwriting attempts output
    setOutput(OUTPUT_TOTAL_ATTEMPTS_KEY, attempt);

    let result;
    let error;

    try {
      result = await runCmd();
    } catch (e) {
      error = e;
    }

    result_list.push(result); // also push undefined result

    if (result) {
      if (result.state == STATE_OK) {
        info(`Command completed after ${attempt} attempt(s).`);
        break;
      }
      else if (
        (result.state == STATE_TIMEOUT && RETRY_ON == 'error') ||
        (result.state == STATE_NONZERO && RETRY_ON == 'timeout')
      ) {
        showStats();
        throw result;
      }
      else if (result.state == STATE_SIGTERM) {
        // no showStats
        throw result;
      }
    }
    else if (error) {
      warning(`Attempt ${attempt} failed. Reason: ${error.message}`);
    }
    else {
      // no result + no error
      warning(`Attempt ${attempt} failed. Internal error`);
    }

    if (attempt === MAX_ATTEMPTS) {
      showStats();
      result.state = result.state | STATE_MAX_ATTEMPTS;
      result.message = 'Final attempt failed. ' + result.message;
      throw result;
    }

    // wait before next retry
    await retryWait();
  }
}

function do_exit(code) {
  setOutput(OUTPUT_EXIT_CODE_KEY, code);
  process.exit(code);
}

runAction()
  .then(() => {
    do_exit(0); // success
  })
  .catch((last_result) => {
    const { message, state, exit_code } = last_result;
    error(message);

    // these can be  helpful to know if continue-on-error is true
    setOutput(OUTPUT_EXIT_ERROR_KEY, message);
    setOutput(OUTPUT_EXIT_STATE_KEY, state);

    // exit with exact error code if available, otherwise just exit with 1
    do_exit(exit_code || 1);
  });
