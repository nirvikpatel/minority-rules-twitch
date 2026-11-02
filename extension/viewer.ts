import {command,createGame,snapshot,tick,vote} from '../src/engine';
import {api,escape,type TwitchAuth,type ViewerState} from './shared';
import './style.css';
import './depth.css';
import '../src/confetti.css';
import '../src/welcome.css';
import {confettiMarkup} from '../src/confetti';

const root=document.querySelector<HTMLElement>('#extension')!;
const preview=new URLSearchParams(location.search).get('preview')==='1';
let auth:TwitchAuth|undefined,state:ViewerState|undefined,busy=false,polling=false,failure='',feedback='',offset=0,lastRender='';
let celebratedVersion:number|undefined;
const sample=createGame();
if(preview){
  sample.settings.seconds=15;command(sample,{type:'start',version:0},Date.now(),()=>0);
  for(let i=0;i<8;i++)vote(sample,`sample-${i}`,`Demo player ${i+1}`,i<5?'A':'B',Date.now());
  sampleState();
}
function sampleState(){
  tick(sample,Date.now());
  if(state&&state.game.version!==sample.version)feedback='';
  const p=sample.players.preview,hidden=sample.phase==='reveal'&&!snapshot(sample,Date.now()).result;
  state={game:{...snapshot(sample,Date.now()),demo:true,connection:'preview'},you:{status:!p?'waiting':p.alive||hidden?sample.phase==='winners'?'winner':'alive':'out',choice:sample.votes.preview}};
}
async function refresh(){
  if(preview){sampleState();render();return;}
  if(!auth||polling||busy)return;
  polling=true;
  try{
    const next=await api<ViewerState>('state',auth);
    if(!busy){if(state&&next.game.version!==state.game.version)feedback='';state=next;offset=next.game.serverNow-Date.now();failure='';}
  }catch(error){failure=(error as Error).message;}
  finally{polling=false;render();}
}
async function choose(choice:'A'|'B'){
  if(!state||busy)return;
  busy=true;feedback='';render();
  try{
    if(preview){vote(sample,'preview','You (preview)',choice,Date.now());sampleState();}
    else if(auth){
      state=await api<ViewerState>('vote',auth,{choice,version:state.game.version,round:state.game.round,helixToken:auth.helixToken});
      offset=state.game.serverNow-Date.now();
      if(!state.accepted)feedback=state.message??'';
    }
    failure='';
  }catch(error){failure=(error as Error).message;}
  finally{busy=false;render();}
}
function render(){
  const g=state?.game,you=state?.you;
  const seconds=g?Math.max(0,Math.ceil((g.deadline-Date.now()-offset)/1000)):0;
  const closed=!g||g.phase!=='voting'||seconds===0;
  const signature=JSON.stringify([g?.phase,g?.version,g?.result,g?.alive,g?.voted,g?.question,you,busy,failure,feedback,closed]);
  if(signature===lastRender)return;
  lastRender=signature;
  const focused=document.activeElement instanceof HTMLElement?document.activeElement.dataset.choice:undefined;
  const eligible=!!you&&['waiting','alive'].includes(you.status);
  const canVote=!closed&&eligible&&!busy&&!failure;
  const waiting=!g||g.phase==='waiting',finished=g?.phase==='winners'||g?.phase==='wipeout';
  const title=!g?'Connecting…':waiting?g.welcome?'The game will start soon':'Waiting for a game':g.phase==='winners'?'The winners':g.phase==='wipeout'?'Nobody survived':g.question?.prompt;
  const status=!g?'':waiting?'Ready when the host is':finished?'Game over':`Round ${g.round}`;
  const instruction=waiting?'The host will start shortly.':finished?'Thanks for playing.':g.phase==='voting'?'Choose the less popular answer.':!g.result?'Votes closed. Revealing results…':g.result.survivingSide==='tie'?'A tie. Both sides survive.':`${g.result.survivingSide} was the minority.`;
  const personal=finished?you?.status==='winner'?'You won!':g?.phase==='wipeout'?'Everyone is out. Try again next game.':'Join the next game to try again.'
    :you?.status==='identity'?'Share your Twitch name to join. You can watch without sharing.'
    :you?.status==='out'?'You’re out — ghosts can’t vote. Cheer for the survivors!'
    :you?.status==='spectator'?'You’re watching. Join the next game in round 1.'
    :busy?'Saving your vote…'
    :g?.phase==='voting'?you?.choice?`Your vote: ${you.choice}. You can change it.`:g.round===1?'Pick A or B to join this game.':'Pick A or B to stay in the game.'
    :waiting?'The smaller side survives each round.':'';
  const celebrate=g?.phase==='winners'&&celebratedVersion!==g.version;
  if(celebrate)celebratedVersion=g.version;
  const priorConfetti=g?.phase==='winners'?root.querySelector<HTMLDivElement>('.confetti'):null;
  root.innerHTML=`${celebrate?confettiMarkup(38):''}${g?.welcome?'<div class="welcome-orbit" aria-hidden="true"><i></i><i></i><i></i></div>':''}<header><span class="wordmark">Minority Rules</span>${preview?'<span class="preview-tag">Preview</span>':''}</header>
    ${preview?'<p class="preview-notice">Simulated game · no live votes</p>':''}
    <section class="game ${g?.phase==='winners'?'is-winner':''}"><div class="round-row"><span>${escape(status)}</span>${g?.phase==='voting'?`<strong class="clock ${seconds<=5?'urgent':''}" aria-label="Time remaining">${seconds}s</strong>`:''}</div>
    ${g?.phase==='winners'?'<div class="winner-emblem" aria-hidden="true">✦</div>':''}<h1>${escape(title)}</h1><p class="instruction">${escape(instruction)}</p>
    ${g?.welcome?'<div class="welcome-loader" aria-hidden="true"><i></i><i></i><i></i></div>':''}
    ${!waiting&&!finished?`<div class="ballot">${(['A','B'] as const).map(side=>{
      const won=g?.result&&(g.result.survivingSide===side||g.result.survivingSide==='tie');
      return `<button class="answer ${you?.choice===side?'selected':''} ${g?.result?(won?'survives':'eliminated'):''}" data-choice="${side}" aria-pressed="${you?.choice===side}" ${canVote?'':'disabled'}><span class="letter">${side}</span><span class="answer-text">${escape(side==='A'?g?.question?.a:g?.question?.b)}${g?.result?`<small>${won?'Survives':'Eliminated'}</small>`:''}</span><span class="answer-mark">${g?.result?`${side==='A'?g.result.a:g.result.b}`:you?.choice===side?'✓':''}</span></button>`;
    }).join('')}</div>`:''}
    ${g?.phase==='winners'?`<div class="winners">${g.winners.map(w=>`<span>${escape(w.name)}</span>`).join('')}</div>`:''}
    <p class="personal" role="status">${escape(personal)}</p>
    ${you?.status==='identity'&&!finished?'<button id="share" class="primary">Allow Twitch identity</button>':''}
    ${failure||feedback?`<p class="feedback" role="alert">${escape(failure||feedback)}</p>`:''}
    ${!waiting?`<div class="totals"><span><b>${g?.alive??0}</b> alive</span><span><b>${g?.voted??0}</b> voted</span></div>`:''}
    ${g?.phase==='voting'?'<p class="footnote">Vote totals are hidden until the reveal.</p>':''}
    ${g?.phase==='results'&&g.nextRoundAt?'<p class="footnote" id="next-countdown"></p>':''}
    ${preview&&g&&g.phase!=='voting'&&g.phase!=='reveal'?'<button class="primary" id="reset">Try another round</button>':''}
    </section>`;
  if(priorConfetti&&!celebrate)root.insertBefore(priorConfetti,root.firstChild);
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.choice as 'A'|'B')));
  if(focused==='A'||focused==='B')root.querySelector<HTMLButtonElement>(`[data-choice="${focused}"]`)?.focus({preventScroll:true});
  root.querySelector('#share')?.addEventListener('click',()=>window.Twitch?.ext.actions.requestIdShare());
  root.querySelector('#reset')?.addEventListener('click',()=>location.reload());
}
if(!preview){
  window.Twitch?.ext.onAuthorized(next=>{auth=next;feedback='';void refresh();});
  window.Twitch?.ext.onError(()=>{failure='Twitch authorization is unavailable. Reload the panel.';render();});
  setTimeout(()=>{if(!auth){failure='Open this panel on patelnirvik’s Twitch channel.';render();}},8000);
}
setInterval(()=>void refresh(),1500);
setInterval(()=>{
  if(preview)sampleState();
  render();
  const clock=root.querySelector('.clock');
  if(state?.game.phase==='voting'&&clock)clock.textContent=`${Math.max(0,Math.ceil((state.game.deadline-Date.now()-offset)/1000))}s`;
  const next=root.querySelector('#next-countdown');
  if(next&&state?.game.nextRoundAt)next.textContent=`Next round in ${Math.max(0,Math.ceil((state.game.nextRoundAt-Date.now()-offset)/1000))}s`;
},250);
render();
