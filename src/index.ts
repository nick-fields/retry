import { error } from '@actions/core';

import { getInputs } from './inputs';
import { runAction } from './action';

const inputs = getInputs();

runAction(inputs)
  .then((exitCode) => process.exit(exitCode))
  .catch((err) => {
    error(`Failed test with exception ${err.message}`);
    process.exit(1);
  });
