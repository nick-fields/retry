# retry

Retries an Action step on failure or timeout. This is currently intended to replace the `run` step for moody commands.

## Inputs

### `timeout_minutes`

**Required** Minutes to wait before attempt times out

### `max_attempts`

**Required** Number of attempts to make before failing the step

### `command`

**Required** The command to run

### `retry_wait_seconds`

**Optional** Number of seconds to wait before attempting the next retry. Defaults to `10`

### `polling_interval_seconds`

**Optional** Number of seconds to wait while polling for command result. Defaults to `1`

## Example usage

```yaml
uses: nick-invision/retry@v1
with:
  timeout_minutes: 10
  max_attempts: 3
  command: npm install
```

## Requirements

NodeJS is required for this action to run.  This runs without issue on all GitHub hosted runners but if you are running into issues with this on self hosted runners ensure NodeJS is installed.
