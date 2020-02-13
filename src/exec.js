const { exec } = require('child_process');
const COMMAND = process.argv.splice(2).join(' ');

function run(){
    await exec(COMMAND,(err, stdout, stderr)=>{
        
    });
}

run();