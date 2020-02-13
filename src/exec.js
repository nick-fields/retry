const { execSync } = require('child_process');
const COMMAND = process.argv.splice(2).join(' ');

function run(){
    execSync(COMMAND, {stdio: 'inherit'});
}

run();