const { execSync } = require('child_process');
const COMMAND = process.argv.splice(2)[0];

function run() {
  execSync(COMMAND, { stdio: 'inherit' });
}

run();
