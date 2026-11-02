import assert from 'node:assert/strict';
const origin=process.argv[2]??'http://localhost:8787';
async function call(path,options={}){const response=await fetch(`${origin}${path}`,{...options,headers:{Origin:origin,...options.headers}});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;}
const {id,control}=await call('/api/demo',{method:'POST'}),base=`/api/room/${id}`,headers={Authorization:`Bearer ${control}`,'Content-Type':'application/json'};
let state=await call(`${base}/state`,{headers});
async function command(type,extra={}){state=await call(`${base}/command`,{method:'POST',headers,body:JSON.stringify({type,version:state.version,...extra})});}
await command('settings',{settings:{pack:'mixed',seconds:15,sound:false}});
await command('start');
while(state.phase!=='winners'&&state.phase!=='wipeout'){
 assert.ok(state.round<=15,'Game did not finish in 15 rounds');
 await new Promise(resolve=>setTimeout(resolve,1000));
 state=await call(`${base}/state`,{headers});
 if(state.phase==='results'){console.log(`Round ${state.round}: ${state.result.a} / ${state.result.b}; ${state.alive} survived.`);await command('next');}
}
if(state.phase==='winners'){assert.ok(state.winners.length>=1&&state.winners.length<=3);assert.equal(state.winners.length,state.alive);console.log(`PASS: complete game in ${state.round} rounds; ${state.winners.length} named winner(s).`);}else{assert.equal(state.alive,0);console.log(`PASS: complete game in ${state.round} rounds; total wipeout.`);}
await command('end');
