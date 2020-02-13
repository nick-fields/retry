const {getInput} = require('@actions/core')
const { spawn } = require('child_process');
const { join } = require('path');
var kill  = require('tree-kill');

function getInputNumber(id, required){
    const input = getInput(id, { required });
    const num = Number.parseInt(input)

    if (!Number.isInteger(num)) {
        throw `Input ${id} only accepts numbers.  Received ${input}`
    }
    
    return num
}

// inputs
const TIMEOUT_MINUTES = getInputNumber('timeout_minutes', true);
const MAX_ATTEMPTS = getInputNumber('max_attempts', true);
const COMMAND = getInput('command', { required: true });
const RETRY_WAIT_SECONDS = getInputNumber('retry_wait_seconds', false);
const POLLING_INTERVAL_SECONDS = getInputNumber('polling_interval_seconds', false) * 1000;

const TIMEOUT = (TIMEOUT_MINUTES * 60) * 1000;

async function wait(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCmd(){
    const end_time = Date.now() + TIMEOUT;

    var child = spawn('node', [join(__dirname, 'exec.js'), COMMAND], { stdio: 'inherit'});
    var done = false;
    child.on('error', ()=>{
        throw new Error('An error occurred while executing command')
    })
    child.on('disconnect', ()=>{
        throw new Error('A disconnect occurred while executing command')
    })
    child.on('exit', ()=>{
        done = true
    });

    do {
        await wait(POLLING_INTERVAL_SECONDS);
    } while (Date.now() < end_time && !done);

    if (!done) {
        kill(child.pid)
        await wait(RETRY_WAIT_SECONDS * 1000);
        throw new Error(`Timeout hit @ ${new Date()}`)
    }
}

async function runAction(){
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await runCmd();
            break;
        } catch (error) {
            if (attempt === MAX_ATTEMPTS) {
                throw new Error(`Final attempt failed. ${error.message}`)
            } else {
                console.warn(`Attempt ${attempt} failed. Reason:`, error.message)
            }
        }
    }
}

runAction().catch((err)=>{
    console.error(err.message);
    process.exit(1)
})