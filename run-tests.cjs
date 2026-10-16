const {spawnSync}=require('node:child_process');
const tests=['test.cjs','test-display.cjs','test-sound.cjs','test-music.cjs','test-threat.cjs','test-recordings.cjs','test-audio-stages.cjs','test-audio-start.cjs','test-monsters.cjs','test-bootstrap.cjs','test-mobile-audio.cjs','test-mobile-start.cjs','test-mobile-unlock.cjs','test-mobile-balance.cjs','test-touch.cjs','test-touch-lifecycle.cjs','test-mobile-build.cjs'];
let failed=false;
for(const file of tests){const result=spawnSync(process.execPath,[file],{cwd:__dirname,encoding:'utf8'});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error);if(result.status!==0)failed=true;}
for(const mode of ['enabled','muted']){console.log('Gameplay with audio '+mode);const result=spawnSync(process.execPath,['test.cjs'],{cwd:__dirname,env:{...process.env,LANTERN_TEST_AUDIO:mode},encoding:'utf8'});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error);if(result.status!==0)failed=true;}
process.exitCode=failed?1:0;

