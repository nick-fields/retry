# retry

Retries an Action step on failure or timeout. This is currently intended to replace the `run` step for moody commands.

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

### `polling_interval_seconds`

**Optional** Number of seconds to wait while polling for command result. Defaults to `1`

### `retry_on`

**Optional** Event to retry on. Currently supports [any (default), timeout, error].

### `warning_on_retry`

**Optional** Whether to output a warning on retry, or just output to info. Defaults to `true`.

## Outputs

### `total_attempts`

The final number of attempts made

### `exit_code`

The final exit code returned by the command

### `exit_error`

The final error returned by the command

## Examples

### Timeout in minutes

```yaml
uses: nick-invision/retry@v2
with:
  timeout_minutes: 10
  max_attempts: 3
  command: npm run some-typically-slow-script
```

### Timeout in seconds

```yaml
uses: nick-invision/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  command: npm run some-typically-fast-script
```

### Only retry after timeout

```yaml
uses: nick-invision/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  retry_on: timeout
  command: npm run some-typically-fast-script
```

### Only retry after error

```yaml
uses: nick-invision/retry@v2
with:
  timeout_seconds: 15
  max_attempts: 3
  retry_on: error
  command: npm run some-typically-fast-script
```

### Retry but allow failure and do something with output

```yaml
- uses: nick-invision/retry@v2
  id: retry
  # see https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions#jobsjob_idcontinue-on-error
  continue-on-error: true
  with:
    timeout_seconds: 15
    max_attempts: 3
    retry_on: error
    command: node -e 'process.exit(99);'
- name: Assert that action failed
  uses: nick-invision/assert-action@v1
  with:
    expected: failure
    actual: ${{ steps.retry.outcome }}
- name: Assert that action exited with expected exit code
  uses: nick-invision/assert-action@v1
  with:
    expected: 99
    actual: ${{ steps.retry.outputs.exit_code }}
- name: Assert that action made expected number of attempts
  uses: nick-invision/assert-action@v1
  with:
    expected: 3
    actual: ${{ steps.retry.outputs.total_attempts }}
```

## Requirements

NodeJS is required for this action to run. This runs without issue on all GitHub hosted runners but if you are running into issues with this on self hosted runners ensure NodeJS is installed.
