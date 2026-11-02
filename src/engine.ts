import { drawQuestion, type Pack, type Question } from './questions';
export type Phase = 'waiting'|'voting'|'reveal'|'results'|'winners'|'wipeout';
export interface Player {id:string;name:string;alive:boolean}
export interface Settings {pack:Pack;seconds:number;sound:boolean;autoNext?:boolean;autoNextSeconds?:number}
export interface Result {a:number;b:number;survivingSide:'A'|'B'|'tie';eliminated:number;absent:number;survivors:number}
export interface Game {
 phase:Phase;version:number;round:number;players:Record<string,Player>;votes:Record<string,'A'|'B'>;
 settings:Settings;question?:Question;deadline:number;revealAt:number;result?:Result;used:string[];
 starting:Record<string,Player>;interrupted:boolean;notice:string;toast?:{text:string;at:number};toasted:string[];
 history:{round:number;question:string;result:Result}[];welcome?:boolean;nextRoundAt?:number;customQuestions?:Question[];
}
export type Command = {type:'start'|'next'|'end'|'welcome'|'automation'|'questions'|'settings';version:number;settings?:Settings;autoNext?:boolean;autoNextSeconds?:number;questions?:Question[]};
export function createGame():Game {return {phase:'waiting',version:0,round:0,players:{},votes:{},settings:{pack:'mixed',seconds:30,sound:true},question:undefined,result:undefined,toast:undefined,deadline:0,revealAt:0,used:[],starting:{},interrupted:false,notice:'',toasted:[],history:[]};}
export function command(g:Game,c:Command,now:number,random=Math.random) {
 if(c.version!==g.version) throw new Error('The game changed. Please try again.');
 if(c.type==='questions') {
  if(g.phase!=='waiting'||g.interrupted)throw new Error('Show the welcome screen before editing questions.');
  if(!Array.isArray(c.questions)||c.questions.length>50)throw new Error('Save up to 50 questions.');
  const clean=c.questions.map((q,i)=>{
   if(!q||![q.prompt,q.a,q.b].every(v=>typeof v==='string'&&v.trim().length>0)||q.prompt.length>200||q.a.length>100||q.b.length>100)throw new Error('Each question needs text (up to 200 characters) and two options (up to 100 each).');
   return {id:`custom-${i}`,pack:'custom' as const,prompt:q.prompt.trim(),a:q.a.trim(),b:q.b.trim()};
  });
  g.customQuestions=clean;g.used=[];
 } else if(c.type==='automation') {
  if(typeof c.autoNext!=='boolean'||!Number.isInteger(c.autoNextSeconds)||c.autoNextSeconds!<5||c.autoNextSeconds!>120)throw new Error('Choose an automatic round delay from 5 to 120 seconds.');
  g.settings={...g.settings,autoNext:c.autoNext,autoNextSeconds:c.autoNextSeconds};
  g.nextRoundAt=c.autoNext&&g.phase==='results'?now+c.autoNextSeconds!*1000:0;
 } else if(c.type==='settings') {
  if(g.phase!=='waiting'||g.interrupted) throw new Error('Settings are locked during a game.');
  const s=c.settings;
  if(!s||!['mixed','food','gaming','rather','custom'].includes(s.pack)||!Number.isInteger(s.seconds)||s.seconds<15||s.seconds>90||typeof s.sound!=='boolean'||(s.autoNext!==undefined&&typeof s.autoNext!=='boolean')||(s.autoNextSeconds!==undefined&&(!Number.isInteger(s.autoNextSeconds)||s.autoNextSeconds<5||s.autoNextSeconds>120))) throw new Error('Choose a pack and a timer from 15 to 90 seconds.');
  g.settings={...s};
 } else if(c.type==='end'||c.type==='welcome') {
  if(c.type==='welcome'&&!['waiting','winners','wipeout'].includes(g.phase))throw new Error('Finish or end the current game before showing the welcome screen.');
  const settings=g.settings, version=g.version,customQuestions=g.customQuestions; Object.assign(g,createGame(),{settings,version,customQuestions,notice:'Game ended. Ready for another?'});
  g.welcome=c.type==='welcome';g.nextRoundAt=0;
  if(g.welcome)g.notice='';
 } else {
  if(c.type==='start') {
   if(g.settings.pack==='custom'&&!g.customQuestions?.length)throw new Error('Add a question in My questions before starting.');
   if(!['waiting','winners','wipeout'].includes(g.phase)) throw new Error('A game is already running.');
   if(!g.interrupted){const settings=g.settings,version=g.version,customQuestions=g.customQuestions;Object.assign(g,createGame(),{settings,version,customQuestions});}
  } else if(g.phase!=='results') throw new Error('Wait for the reveal to finish.');
  g.welcome=false;g.nextRoundAt=0;g.round++;g.starting=structuredClone(g.players);g.votes={};g.result=undefined;g.toasted=[];g.toast=undefined;
  const q=drawQuestion(g.settings.pack,g.used,g.question?.id,random,g.customQuestions);
  if(g.used.includes(q.id))g.used=[];g.used.push(q.id);g.question=q;
  g.phase='voting';g.deadline=now+g.settings.seconds*1000;g.interrupted=false;g.notice='';
 }
 g.version++;
}
export function vote(g:Game,id:string,name:string,text:string,now:number):'accepted'|'ignored'|'closed'|'out'|'spectator' {
 const value=text.trim().toUpperCase();if(value!=='A'&&value!=='B')return 'ignored';
 if(g.phase!=='voting'||now>=g.deadline)return 'closed';
 const player=g.players[id];
 if(g.round>1&&!player){rejection(g,id,`@${name}, grab some popcorn. You’re spectating!`,now);return 'spectator';}
 if(player&&!player.alive){rejection(g,id,`@${name}, ghosts don’t get a ballot.`,now);return 'out';}
 g.players[id]={id,name,alive:true};g.votes[id]=value;return 'accepted';
}
function rejection(g:Game,id:string,text:string,now:number){
 if(g.toasted.includes(id))return;
 if(g.toast&&now-g.toast.at<3000)return;
 g.toasted.push(id);g.toast={text,at:now};
}
export function tick(g:Game,now:number) {
 if(g.phase==='voting'&&now>=g.deadline) {
  const values=Object.values(g.votes),a=values.filter(v=>v==='A').length,b=values.length-a;
  if(g.round===1&&!values.length){g.phase='waiting';g.notice='No players joined. Let’s try again.';g.round=0;g.version++;return;}
  const side=a===b?'tie':a<b?'A':'B';let eliminated=0,absent=0;
  for(const p of Object.values(g.players))if(p.alive){if(!g.votes[p.id]||(side!=='tie'&&g.votes[p.id]!==side)){p.alive=false;eliminated++;if(!g.votes[p.id])absent++;}}
  g.result={a,b,survivingSide:side,eliminated,absent,survivors:Object.values(g.players).filter(p=>p.alive).length};
  g.phase='reveal';g.revealAt=now;g.version++;
 }
 if(g.phase==='reveal'&&now>=g.revealAt+6500){
  const result=g.result!;g.history.push({round:g.round,question:g.question!.prompt,result});
  g.phase=result.survivors===0?'wipeout':result.survivors<=3?'winners':'results';
  g.nextRoundAt=g.phase==='results'&&g.settings.autoNext?now+(g.settings.autoNextSeconds??30)*1000:0;g.version++;
 }
 if(g.phase==='results'&&g.settings.autoNext&&g.nextRoundAt&&now>=g.nextRoundAt)command(g,{type:'next',version:g.version},now);
}
export function interrupt(g:Game){
 if(g.phase!=='voting')return;
 g.players=structuredClone(g.starting);g.votes={};g.phase='waiting';g.round--;g.interrupted=true;g.result=undefined;
 g.notice='Chat disconnected. Round voided — reconnect, then restart with a fresh question.';g.version++;
}
export function snapshot(g:Game,now:number) {
 const visible=g.phase!=='voting'&&(g.phase!=='reveal'||now>=g.revealAt+2500);
 const question=g.question;
 return {phase:g.phase,version:g.version,round:g.round,settings:g.settings,question,deadline:g.deadline,revealAt:g.revealAt,welcome:g.welcome,nextRoundAt:g.nextRoundAt,customCount:g.customQuestions?.length??0,
  alive:g.phase==='reveal'&&!visible?Object.values(g.players).filter(p=>p.alive).length+(g.result?.eliminated??0):Object.values(g.players).filter(p=>p.alive).length,
  joined:Object.keys(g.players).length,voted:Object.keys(g.votes).length,
  ...(visible&&g.result?{result:g.result}:{}),
  winners:g.phase==='winners'?Object.values(g.players).filter(p=>p.alive).map(p=>({id:p.id,name:p.name})):[],
  history:g.history,notice:g.notice,interrupted:g.interrupted,toast:g.toast&&now-g.toast.at<5000?g.toast:undefined,serverNow:now};
}
export type Snapshot = ReturnType<typeof snapshot>;
