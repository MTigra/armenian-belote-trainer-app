import {spawn} from 'node:child_process';
const windows=process.platform==='win32';
const children=[spawn(windows?'gradlew.bat':'./gradlew',[':server:run'],{stdio:'inherit',shell:windows}),spawn('pnpm',['dev:web'],{stdio:'inherit',shell:windows})];
function stop(){for(const child of children)child.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
for(const child of children){child.on('error',error=>{console.error(error.message);stop();process.exitCode=1;});child.on('exit',code=>{if(code)process.exitCode=code;stop();});}
