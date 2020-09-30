module.exports =
/******/ (function(modules, runtime) { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	__webpack_require__.ab = __dirname + "/";
/******/
/******/ 	// the startup function
/******/ 	function startup() {
/******/ 		// Load entry module and return exports
/******/ 		return __webpack_require__(163);
/******/ 	};
/******/
/******/ 	// run startup
/******/ 	return startup();
/******/ })
/************************************************************************/
/******/ ({

/***/ 87:
/***/ (function(module) {

module.exports = require("os");

/***/ }),

/***/ 129:
/***/ (function(module) {

module.exports = require("child_process");

/***/ }),

/***/ 163:
/***/ (function(__unusedmodule, __unusedexports, __webpack_require__) {

const { getInput, error, warning, info, debug, setOutput } = __webpack_require__(589);
const { spawn } = __webpack_require__(129);
const { join } = __webpack_require__(622);
const ms = __webpack_require__(535);
var kill = __webpack_require__(591);

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
  var child = spawn('node', [__webpack_require__.ab + "exec.js", COMMAND], { stdio: 'inherit' });

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


/***/ }),

/***/ 247:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(__webpack_require__(87));
const utils_1 = __webpack_require__(687);
/**
 * Commands
 *
 * Command Format:
 *   ::name key=value,key=value::message
 *
 * Examples:
 *   ::warning::This is the message
 *   ::set-env name=MY_VAR::some value
 */
function issueCommand(command, properties, message) {
    const cmd = new Command(command, properties, message);
    process.stdout.write(cmd.toString() + os.EOL);
}
exports.issueCommand = issueCommand;
function issue(name, message = '') {
    issueCommand(name, {}, message);
}
exports.issue = issue;
const CMD_STRING = '::';
class Command {
    constructor(command, properties, message) {
        if (!command) {
            command = 'missing.command';
        }
        this.command = command;
        this.properties = properties;
        this.message = message;
    }
    toString() {
        let cmdStr = CMD_STRING + this.command;
        if (this.properties && Object.keys(this.properties).length > 0) {
            cmdStr += ' ';
            let first = true;
            for (const key in this.properties) {
                if (this.properties.hasOwnProperty(key)) {
                    const val = this.properties[key];
                    if (val) {
                        if (first) {
                            first = false;
                        }
                        else {
                            cmdStr += ',';
                        }
                        cmdStr += `${key}=${escapeProperty(val)}`;
                    }
                }
            }
        }
        cmdStr += `${CMD_STRING}${escapeData(this.message)}`;
        return cmdStr;
    }
}
function escapeData(s) {
    return utils_1.toCommandValue(s)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}
function escapeProperty(s) {
    return utils_1.toCommandValue(s)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A')
        .replace(/:/g, '%3A')
        .replace(/,/g, '%2C');
}
//# sourceMappingURL=command.js.map

/***/ }),

/***/ 356:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

// For internal use, subject to change.
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// We use any as a valid input type
/* eslint-disable @typescript-eslint/no-explicit-any */
const fs = __importStar(__webpack_require__(747));
const os = __importStar(__webpack_require__(87));
const utils_1 = __webpack_require__(687);
function issueCommand(command, message) {
    const filePath = process.env[`GITHUB_${command}`];
    if (!filePath) {
        throw new Error(`Unable to find environment variable for file command ${command}`);
    }
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing file at path: ${filePath}`);
    }
    fs.appendFileSync(filePath, `${utils_1.toCommandValue(message)}${os.EOL}`, {
        encoding: 'utf8'
    });
}
exports.issueCommand = issueCommand;
//# sourceMappingURL=file-command.js.map

/***/ }),

/***/ 535:
/***/ (function(module) {

function calc(m) {
    return function(n) { return Math.round(n * m); };
};
module.exports = {
    seconds: calc(1e3),
    minutes: calc(6e4),
    hours: calc(36e5),
    days: calc(864e5),
    weeks: calc(6048e5),
    months: calc(26298e5),
    years: calc(315576e5)
};


/***/ }),

/***/ 589:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = __webpack_require__(247);
const file_command_1 = __webpack_require__(356);
const utils_1 = __webpack_require__(687);
const os = __importStar(__webpack_require__(87));
const path = __importStar(__webpack_require__(622));
/**
 * The code to exit an action
 */
var ExitCode;
(function (ExitCode) {
    /**
     * A code indicating that the action was successful
     */
    ExitCode[ExitCode["Success"] = 0] = "Success";
    /**
     * A code indicating that the action was a failure
     */
    ExitCode[ExitCode["Failure"] = 1] = "Failure";
})(ExitCode = exports.ExitCode || (exports.ExitCode = {}));
//-----------------------------------------------------------------------
// Variables
//-----------------------------------------------------------------------
/**
 * Sets env variable for this action and future actions in the job
 * @param name the name of the variable to set
 * @param val the value of the variable. Non-string values will be converted to a string via JSON.stringify
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exportVariable(name, val) {
    const convertedVal = utils_1.toCommandValue(val);
    process.env[name] = convertedVal;
    const filePath = process.env['GITHUB_ENV'] || '';
    if (filePath) {
        const delimiter = '_GitHubActionsFileCommandDelimeter_';
        const commandValue = `${name}<<${delimiter}${os.EOL}${convertedVal}${os.EOL}${delimiter}`;
        file_command_1.issueCommand('ENV', commandValue);
    }
    else {
        command_1.issueCommand('set-env', { name }, convertedVal);
    }
}
exports.exportVariable = exportVariable;
/**
 * Registers a secret which will get masked from logs
 * @param secret value of the secret
 */
function setSecret(secret) {
    command_1.issueCommand('add-mask', {}, secret);
}
exports.setSecret = setSecret;
/**
 * Prepends inputPath to the PATH (for this action and future actions)
 * @param inputPath
 */
function addPath(inputPath) {
    const filePath = process.env['GITHUB_PATH'] || '';
    if (filePath) {
        file_command_1.issueCommand('PATH', inputPath);
    }
    else {
        command_1.issueCommand('add-path', {}, inputPath);
    }
    process.env['PATH'] = `${inputPath}${path.delimiter}${process.env['PATH']}`;
}
exports.addPath = addPath;
/**
 * Gets the value of an input.  The value is also trimmed.
 *
 * @param     name     name of the input to get
 * @param     options  optional. See InputOptions.
 * @returns   string
 */
function getInput(name, options) {
    const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
    if (options && options.required && !val) {
        throw new Error(`Input required and not supplied: ${name}`);
    }
    return val.trim();
}
exports.getInput = getInput;
/**
 * Sets the value of an output.
 *
 * @param     name     name of the output to set
 * @param     value    value to store. Non-string values will be converted to a string via JSON.stringify
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOutput(name, value) {
    command_1.issueCommand('set-output', { name }, value);
}
exports.setOutput = setOutput;
/**
 * Enables or disables the echoing of commands into stdout for the rest of the step.
 * Echoing is disabled by default if ACTIONS_STEP_DEBUG is not set.
 *
 */
function setCommandEcho(enabled) {
    command_1.issue('echo', enabled ? 'on' : 'off');
}
exports.setCommandEcho = setCommandEcho;
//-----------------------------------------------------------------------
// Results
//-----------------------------------------------------------------------
/**
 * Sets the action status to failed.
 * When the action exits it will be with an exit code of 1
 * @param message add error issue message
 */
function setFailed(message) {
    process.exitCode = ExitCode.Failure;
    error(message);
}
exports.setFailed = setFailed;
//-----------------------------------------------------------------------
// Logging Commands
//-----------------------------------------------------------------------
/**
 * Gets whether Actions Step Debug is on or not
 */
function isDebug() {
    return process.env['RUNNER_DEBUG'] === '1';
}
exports.isDebug = isDebug;
/**
 * Writes debug message to user log
 * @param message debug message
 */
function debug(message) {
    command_1.issueCommand('debug', {}, message);
}
exports.debug = debug;
/**
 * Adds an error issue
 * @param message error issue message. Errors will be converted to string via toString()
 */
function error(message) {
    command_1.issue('error', message instanceof Error ? message.toString() : message);
}
exports.error = error;
/**
 * Adds an warning issue
 * @param message warning issue message. Errors will be converted to string via toString()
 */
function warning(message) {
    command_1.issue('warning', message instanceof Error ? message.toString() : message);
}
exports.warning = warning;
/**
 * Writes info to log with console.log.
 * @param message info message
 */
function info(message) {
    process.stdout.write(message + os.EOL);
}
exports.info = info;
/**
 * Begin an output group.
 *
 * Output until the next `groupEnd` will be foldable in this group
 *
 * @param name The name of the output group
 */
function startGroup(name) {
    command_1.issue('group', name);
}
exports.startGroup = startGroup;
/**
 * End an output group.
 */
function endGroup() {
    command_1.issue('endgroup');
}
exports.endGroup = endGroup;
/**
 * Wrap an asynchronous function call in a group.
 *
 * Returns the same type as the function itself.
 *
 * @param name The name of the group
 * @param fn The function to wrap in the group
 */
function group(name, fn) {
    return __awaiter(this, void 0, void 0, function* () {
        startGroup(name);
        let result;
        try {
            result = yield fn();
        }
        finally {
            endGroup();
        }
        return result;
    });
}
exports.group = group;
//-----------------------------------------------------------------------
// Wrapper action state
//-----------------------------------------------------------------------
/**
 * Saves state for current action, the state can only be retrieved by this action's post job execution.
 *
 * @param     name     name of the state to store
 * @param     value    value to store. Non-string values will be converted to a string via JSON.stringify
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function saveState(name, value) {
    command_1.issueCommand('save-state', { name }, value);
}
exports.saveState = saveState;
/**
 * Gets the value of an state set by this action's main execution.
 *
 * @param     name     name of the state to get
 * @returns   string
 */
function getState(name) {
    return process.env[`STATE_${name}`] || '';
}
exports.getState = getState;
//# sourceMappingURL=core.js.map

/***/ }),

/***/ 591:
/***/ (function(module, __unusedexports, __webpack_require__) {

"use strict";


var childProcess = __webpack_require__(129);
var spawn = childProcess.spawn;
var exec = childProcess.exec;

module.exports = function (pid, signal, callback) {
    if (typeof signal === 'function' && callback === undefined) {
        callback = signal;
        signal = undefined;
    }

    pid = parseInt(pid);
    if (Number.isNaN(pid)) {
        if (callback) {
            return callback(new Error("pid must be a number"));
        } else {
            throw new Error("pid must be a number");
        }
    }

    var tree = {};
    var pidsToProcess = {};
    tree[pid] = [];
    pidsToProcess[pid] = 1;

    switch (process.platform) {
    case 'win32':
        exec('taskkill /pid ' + pid + ' /T /F', callback);
        break;
    case 'darwin':
        buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
          return spawn('pgrep', ['-P', parentPid]);
        }, function () {
            killAll(tree, signal, callback);
        });
        break;
    // case 'sunos':
    //     buildProcessTreeSunOS(pid, tree, pidsToProcess, function () {
    //         killAll(tree, signal, callback);
    //     });
    //     break;
    default: // Linux
        buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
          return spawn('ps', ['-o', 'pid', '--no-headers', '--ppid', parentPid]);
        }, function () {
            killAll(tree, signal, callback);
        });
        break;
    }
};

function killAll (tree, signal, callback) {
    var killed = {};
    try {
        Object.keys(tree).forEach(function (pid) {
            tree[pid].forEach(function (pidpid) {
                if (!killed[pidpid]) {
                    killPid(pidpid, signal);
                    killed[pidpid] = 1;
                }
            });
            if (!killed[pid]) {
                killPid(pid, signal);
                killed[pid] = 1;
            }
        });
    } catch (err) {
        if (callback) {
            return callback(err);
        } else {
            throw err;
        }
    }
    if (callback) {
        return callback();
    }
}

function killPid(pid, signal) {
    try {
        process.kill(parseInt(pid, 10), signal);
    }
    catch (err) {
        if (err.code !== 'ESRCH') throw err;
    }
}

function buildProcessTree (parentPid, tree, pidsToProcess, spawnChildProcessesList, cb) {
    var ps = spawnChildProcessesList(parentPid);
    var allData = '';
    ps.stdout.on('data', function (data) {
        var data = data.toString('ascii');
        allData += data;
    });

    var onClose = function (code) {
        delete pidsToProcess[parentPid];

        if (code != 0) {
            // no more parent processes
            if (Object.keys(pidsToProcess).length == 0) {
                cb();
            }
            return;
        }

        allData.match(/\d+/g).forEach(function (pid) {
          pid = parseInt(pid, 10);
          tree[parentPid].push(pid);
          tree[pid] = [];
          pidsToProcess[pid] = 1;
          buildProcessTree(pid, tree, pidsToProcess, spawnChildProcessesList, cb);
        });
    };

    ps.on('close', onClose);
}


/***/ }),

/***/ 622:
/***/ (function(module) {

module.exports = require("path");

/***/ }),

/***/ 687:
/***/ (function(__unusedmodule, exports) {

"use strict";

// We use any as a valid input type
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Sanitizes an input into a string so it can be passed into issueCommand safely
 * @param input input to sanitize into a string
 */
function toCommandValue(input) {
    if (input === null || input === undefined) {
        return '';
    }
    else if (typeof input === 'string' || input instanceof String) {
        return input;
    }
    return JSON.stringify(input);
}
exports.toCommandValue = toCommandValue;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 747:
/***/ (function(module) {

module.exports = require("fs");

/***/ })

/******/ });