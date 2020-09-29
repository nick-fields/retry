const { exec } = require('child_process');
const COMMAND = process.argv.splice(2)[0];

function run() {
  exec(COMMAND, { stdio: 'inherit' }, (err) => {
    if (err) {
      process.exit(err.code);
    }
  });
}

run();
