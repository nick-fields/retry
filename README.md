# retry
Retries a GitHub Action step on failure or timeout

## Inputs

### `timeout_minutes`

**Required** Minutes to wait before attempt times out

### `max_attempts`

**Required** Number of attempts to make before failing the step

### `retry_wait_seconds`

**Required** Number of seconds to wait before attempting the next retry

### `command`

**Required** The command to run

### `polling_interval_seconds`

**Required** Number of seconds to wait for each check that command has completed running

## Example usage

``` yaml
uses: nick-invision/retry@v1
with:
  timeout_minutes: 10
  max_attempts: 3
  command: npm install
```