# retry

Retries an Action step on failure or timeout. This is currently intended to replace the `run` step for moody commands.

**NOTE:** Ownership of this project was transferred to my personal account `nick-fields` from my work account `nick-invision`. Details [here](#Ownership)

---

## Inputs

### `timeout_minutes`

**Required** Minutes to wait before attempt times out. Must only specify either minutes or seconds

### `timeout_seconds`

**Required** Seconds to wait before attempt times out. Must only specify either minutes or seconds

### `max_attempts`

**Required** Number of attempts to make before failing the step

### `command`

**Required** The command to run

### `retry_wait_seconds`

**Optional** Number of seconds to wait before attempting the next retry. Defaults to `10`

### `shell`

**Optional** Shell to use to execute `command`. Defaults to `powershell` on Windows, `bash` otherwise. Supports bash, python, pwsh, sh, cmd, and powershell per [docs](https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions#using-a-specific-shell)

### `polling_interval_seconds`

**Optional** Number of seconds to wait while polling for command result. Defaults to `1`

### `retry_on`

**Optional** Event to retry on. Currently supports [any (default), timeout, error].

### `warning_on_retry`

**Optional** Whether to output a warning on retry, or just output to info. Defaults to `true`.

### `on_retry_command`

**Optional** Command to run before a retry (such as a cleanup script). Any error thrown from retry command is caught and surfaced as a warning.

### `new_command_on_retry`

**Optional** Command to run if the first attempt fails. This command will be called on all subsequent attempts.

### `continue_on_error`

**Optional** Exit successfully even if an error occurs. Same as native continue-on-error behavior, but for use in composite actions. Defaults to `false`

### `retry_on_exit_code`

**Optional** Specific exit code to retry on. This will only retry for the given error code and fail immediately other error codes.

## Outputs

### `total_attempts`

The final number of attempts made

### `exit_code`

The final exit code returned by the command

### `exit_error`

The final error returned by the command

## Examples

### Shell

```yaml
uses: nick-fields/retry@v2
with:
  timeout_minutes: 10
  max_attempts: 3
  shell: pwsh
  command: dir
```

### Timeout in minutes

```yaml
uses: nick-fields/retry@v2
with:
  timeout_minutes: 10
  max_attempts: 3
  command: npm run some-typically-slow-script
```

### Timeout in seconds

```yaml
uses: nick-fields/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  command: npm run some-typically-fast-script
```

### Only retry after timeout

```yaml
uses: nick-fields/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  retry_on: timeout
  command: npm run some-typically-fast-script
```

### Only retry after error

```yaml
uses: nick-fields/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  retry_on: error
  command: npm run some-typically-fast-script
```

### Retry using continue_on_error input (in composite action) but allow failure and do something with output

```yaml
- uses: nick-fields/retry@v2
  id: retry
  with:
    timeout_seconds: 15
    max_attempts: 3
    continue_on_error: true
    command: node -e 'process.exit(99);'
- name: Assert that step succeeded (despite failing command)
  uses: nick-fields/assert-action@v1
  with:
    expected: success
    actual: ${{ steps.retry.outcome }}
- name: Assert that action exited with expected exit code
  uses: nick-fields/assert-action@v1
  with:
    expected: 99
    actual: ${{ steps.retry.outputs.exit_code }}
```

### Retry using continue-on-error built-in command (in workflow action) but allow failure and do something with output

```yaml
- uses: nick-fields/retry@v2
  id: retry
  # see https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions#jobsjob_idcontinue-on-error
  continue-on-error: true
  with:
    timeout_seconds: 15
    max_attempts: 3
    retry_on: error
    command: node -e 'process.exit(99);'
- name: Assert that action failed
  uses: nick-fields/assert-action@v1
  with:
    expected: failure
    actual: ${{ steps.retry.outcome }}
- name: Assert that action exited with expected exit code
  uses: nick-fields/assert-action@v1
  with:
    expected: 99
    actual: ${{ steps.retry.outputs.exit_code }}
- name: Assert that action made expected number of attempts
  uses: nick-fields/assert-action@v1
  with:
    expected: 3
    actual: ${{ steps.retry.outputs.total_attempts }}
```

### Run script after failure but before retry

```yaml
uses: nick-fields/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  command: npm run some-flaky-script-that-outputs-something
  on_retry_command: npm run cleanup-flaky-script-output
```

### Run different command after first failure

```yaml
uses: nick-fields/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  command: npx jest
  new_command_on_retry: npx jest --onlyFailures
```

### Run multi-line, multi-command script

```yaml
name: Multi-line multi-command Test
uses: ./
with:
  timeout_minutes: 1
  max_attempts: 2
  command: |
    Get-ComputerInfo
    Get-Date
```

### Run multi-line, single-command script

```yaml
name: Multi-line single-command Test
uses: ./
with:
  timeout_minutes: 1
  max_attempts: 2
  shell: cmd
  command: >-
    echo "this is
 a test"
```

## Requirements

NodeJS is required for this action to run. This runs without issue on all GitHub hosted runners but if you are running into issues with this on self hosted runners ensure NodeJS is installed.

---

## **Ownership**

As of 2022/02/15 ownership of this project has been transferred to my personal account `nick-fields` from my work account `nick-invision` due to me leaving InVision. I am the author and have been the primary maintainer since day one and will continue to maintain this as needed.

Existing workflow references to `nick-invision/retry@<whatever>` no longer work and must be updated to `nick-fields/retry@<whatever>`.
