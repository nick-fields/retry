# retry

Retries an Action step on failure. Determines if a failure is a flake based on the test output

## Inputs

### `max_attempts`

**Required** Number of attempts to make before failing the step

### `command`

**Required** The command to run

### `substrings_indicating_flaky_execution`

**Optional** Execution is considered a flake if any output line contains any of these lines as a substring. Note - if not specified, all failures are considered as real failures.

## Examples

```yaml
uses: oppia/retry@develop
with:
  max_attempts: 2
  substrings_indicating_flaky_execution: |
    First flaky substring
    Second flaky substring
  command: ./run_tests.sh
```

## Commands

`npm install` to install dependencies.

`npm run prepare` to build dist/index.js.

`npm test` to run tests.
