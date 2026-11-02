import {DurableObject} from 'cloudflare:workers';
import {command,createGame,snapshot,tick,vote,type Command,type Game} from '../src/engine';
import {ExtensionAuthError,isBroadcaster,linkedUserId,verifyExtensionToken,type ExtensionClaims} from './extension-auth';

interface Env {
  GAME: DurableObjectNamespace<GameRoom>; ASSETS: Fetcher;
  EXTENSION_CLIENT_ID: string; EXTENSION_SECRET: string;
  BROADCASTER_ID: string; APP_ORIGIN: string; SESSION_SECRET: string;
}
const json = (data:unknown,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const randomToken = () => crypto.randomUUID()+crypto.randomUUID();
const encode = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function cookies(req:Request) {return Object.fromEntries((req.headers.get('Cookie')??'').split(';').map(v=>v.trim().split('=')));}
async function signature(value:string,secret:string) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))));
}
async function owner(req:Request,env:Env) {
  if (!env.SESSION_SECRET || !env.BROADCASTER_ID) return false;
  const token = cookies(req).mr_session;
  if (!token) return false;
  const at = token.lastIndexOf('.'), value = token.slice(0,at);
  if (at<0 || token.slice(at+1)!==await signature(value,env.SESSION_SECRET)) return false;
  const [id,expires] = value.split(':');
  return id===env.BROADCASTER_ID && Number(expires)>Date.now();
}
const configured = (env:Env) => !!(env.EXTENSION_CLIENT_ID && env.EXTENSION_SECRET && /^\d+$/.test(env.BROADCASTER_ID) && env.SESSION_SECRET?.length>=32);
const roomFor = (env:Env,name='live') => env.GAME.get(env.GAME.idFromName(name));

async function extensionRequest(req:Request,env:Env):Promise<Response> {
  const url = new URL(req.url), origin = req.headers.get('Origin');
  const allowed = [url.origin,env.APP_ORIGIN,...(env.EXTENSION_CLIENT_ID?[`https://${env.EXTENSION_CLIENT_ID}.ext-twitch.tv`]:[])];
  if (origin && !allowed.includes(origin)) return json({error:'This Extension origin is not allowed.'},403);
  const cors = (response:Response) => {
    const headers = new Headers(response.headers);
    if (origin) headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Vary','Origin'); headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS'); headers.set('Access-Control-Max-Age','600');
    return new Response(response.body,{status:response.status,headers});
  };
  if (req.method==='OPTIONS') return cors(new Response(null,{status:204}));
  if (!configured(env)) return cors(json({error:'The broadcaster has not connected this Twitch Extension yet.'},503));
  try {
    const claims = await verifyExtensionToken((req.headers.get('Authorization')??'').replace(/^Bearer /,''),env.EXTENSION_SECRET,env.BROADCASTER_ID);
    const action = url.pathname.split('/').at(-1);
    if (!['state','vote','access','launch'].includes(action??'')) return cors(json({error:'Not found.'},404));
    if ((action==='vote'||action==='launch') ? req.method!=='POST' : req.method!=='GET') return cors(json({error:'Method not allowed.'},405));
    if ((action==='access'||action==='launch') && !isBroadcaster(claims)) return cors(json({error:'Only the channel broadcaster can open controls.'},403));
    let body:Record<string,unknown> = {};
    if (req.method==='POST') {
      const text = await req.text();
      if (text.length>12000) return cors(json({error:'Request too large.'},413));
      try {body=text?JSON.parse(text):{};} catch {return cors(json({error:'Invalid request.'},400));}
      if (!body || typeof body!=='object' || Array.isArray(body)) return cors(json({error:'Invalid request.'},400));
    }
    return cors(await roomFor(env).fetch(new Request(`https://room/internal/extension/${action}`,{method:'POST',body:JSON.stringify({claims,body})})));
  } catch (error) {
    if (error instanceof ExtensionAuthError) return cors(json({error:error.message},401));
    console.error('Extension request failed'); return cors(json({error:'Could not reach the game. Please try again.'},500));
  }
}

export default {
  async fetch(req:Request,env:Env):Promise<Response> {
    const url = new URL(req.url), path = url.pathname;
    try {
      if (path.startsWith('/api/extension/')) return extensionRequest(req,env);
      if (path==='/api/config') return json({configured:configured(env),owner:await owner(req,env),channel:'patelnirvik',voting:'extension'});
      if (path==='/auth/extension') {
        if (!configured(env)) return new Response('Configure the Extension first. See EXTENSION_SETUP.md.',{status:503});
        const ticket = url.searchParams.get('ticket');
        if (!ticket || !/^[a-f0-9-]{72}$/.test(ticket)) return new Response('Invalid control link.',{status:400});
        const result = await roomFor(env).fetch(new Request('https://room/internal/redeem',{method:'POST',body:JSON.stringify({ticket})}));
        if (!result.ok) return new Response('This control link expired or was already used. Open a new one from the Extension.',{status:401});
        const value = `${env.BROADCASTER_ID}:${Date.now()+86400000}`;
        return new Response(null,{status:302,headers:{Location:'/?mode=live','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
          'Set-Cookie':`mr_session=${value}.${await signature(value,env.SESSION_SECRET)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${url.protocol==='https:'?'; Secure':''}`}});
      }
      if (path.startsWith('/auth/')) return new Response('Open Minority Rules from the Twitch Extension’s broadcaster configuration.',{status:410});
      if (path.startsWith('/api/')) {
        if (req.method!=='GET' && req.headers.get('Origin')!==url.origin) return json({error:'Invalid request origin.'},403);
        if (path==='/api/demo' && req.method==='POST') {
          const id=`demo-${crypto.randomUUID()}`,control=randomToken();
          await roomFor(env,id).fetch(new Request('https://room/internal/init',{method:'POST',body:JSON.stringify({control})}));
          return json({id,control});
        }
        const match=path.match(/^\/api\/room\/(live|demo-[0-9a-f-]{36})\/(state|ws|command|access|questions)$/);
        if (!match) return json({error:'Not found.'},404);
        const [,id,action]=match;
        if (!['GET','POST'].includes(req.method) || ((action==='command')!==(req.method==='POST'))) return json({error:'Method not allowed.'},405);
        const headers=new Headers({'x-owner':String(id==='live' && await owner(req,env)),Authorization:req.headers.get('Authorization')??''});
        if (req.headers.get('Upgrade')==='websocket') headers.set('Upgrade','websocket');
        const target=new URL(`https://room/${action}`);
        if (url.searchParams.has('token')) target.searchParams.set('token',url.searchParams.get('token')!);
        return roomFor(env,id).fetch(new Request(target,{method:req.method,headers,body:req.method==='POST'?await req.text():undefined}));
      }
      return env.ASSETS.fetch(req);
    } catch {return json({error:'Request failed. Reconnect or try again.'},500);}
  },
} satisfies ExportedHandler<Env>;

export class GameRoom extends DurableObject<Env> {
  game:Game=createGame(); demo=false; control=''; readToken='';
  tickets:Record<string,number>={};
  profiles:Record<string,{name:string;at:number}>={};
  demoPlan:{at:number;id:string;name:string;text:string}[]=[];

  constructor(ctx:DurableObjectState,env:Env) {
    super(ctx,env);
    ctx.blockConcurrencyWhile(async()=>{
      const saved=await ctx.storage.get<Partial<GameRoom>>('state');
      if (saved) {
        this.game=saved.game??createGame(); this.demo=saved.demo??false;
        this.control=saved.control??''; this.readToken=saved.readToken??'';
        this.demoPlan=saved.demoPlan??[]; this.profiles=saved.profiles??{}; this.tickets=saved.tickets??{};
      }
      if (!this.readToken) this.readToken=randomToken();
      // Direct Extension votes have no upstream chat gap: preserve active rounds.
      if (this.game.phase==='voting'||this.game.phase==='reveal'||this.game.phase==='results'&&this.game.nextRoundAt) await ctx.storage.setAlarm(Date.now()+100);
    });
  }
  async persist() {
    await this.ctx.storage.put('state',{game:this.game,demo:this.demo,control:this.control,readToken:this.readToken,demoPlan:this.demoPlan,profiles:this.profiles,tickets:this.tickets});
  }
  view() {return {...snapshot(this.game,Date.now()),demo:this.demo,connection:this.demo?'simulated':configured(this.env)?'extension':'unconfigured'};}
  advance() {
    const round=this.game.round;tick(this.game,Date.now());
    if(this.demo&&this.game.phase==='voting'&&this.game.round!==round)this.scheduleDemo();
  }
  async publish() {
    await this.persist();const data=JSON.stringify(this.view());
    for (const socket of this.ctx.getWebSockets()) {try {socket.send(data);} catch {socket.close();}}
  }
  viewer(claims:ExtensionClaims) {
    const id=linkedUserId(claims), player=id?this.game.players[id]:undefined;
    const state=snapshot(this.game,Date.now());
    const hidden=state.phase==='reveal'&&!state.result;
    const priorAlive=player?.alive || (hidden&&!!this.game.votes[id??'']);
    const status=!id?'identity':player?priorAlive?this.game.phase==='winners'?'winner':'alive':'out':this.game.round>1?'spectator':'waiting';
    return {game:this.view(),you:{status,name:player?.name??this.profiles[id??'']?.name,choice:id?this.game.votes[id]:undefined}};
  }
  async extensionAction(action:string,claims:ExtensionClaims,body:Record<string,unknown>) {
    this.advance();
    if (action==='state') return json(this.viewer(claims));
    if (action==='access') return json({readToken:this.readToken});
    if (action==='launch') {
      const now=Date.now();this.tickets=Object.fromEntries(Object.entries(this.tickets).filter(([,exp])=>exp>now));
      const ticket=randomToken();this.tickets[ticket]=now+60000;await this.persist();
      return json({url:`${this.env.APP_ORIGIN}/auth/extension?ticket=${ticket}`});
    }
    if (action!=='vote') return json({error:'Not found.'},404);
    const id=linkedUserId(claims);
    if (!id) return json({error:'Share your Twitch identity to join. You can still watch without sharing.'},403);
    if ((body.choice!=='A'&&body.choice!=='B') || !Number.isInteger(body.version)||!Number.isInteger(body.round)) return json({error:'Choose A or B for the current round.'},400);
    const current=()=>this.game.phase==='voting'&&body.version===this.game.version&&body.round===this.game.round&&Date.now()<this.game.deadline;
    if (!current()) return json({error:'That round has closed or changed. Your vote was not counted.'},409);
    const player=this.game.players[id];
    if (player&&!player.alive || !player&&this.game.round>1) {
      const result=vote(this.game,id,player?.name??'viewer',body.choice,Date.now());await this.publish();
      return json({...this.viewer(claims),accepted:false,message:result==='out'?'Ghosts don’t get a ballot. Cheer for the survivors!':'Round 1 locked the roster. Enjoy the show!'});
    }
    let name=player?.name??this.profiles[id]?.name;
    if (!name) {
      if (typeof body.helixToken!=='string'||body.helixToken.length>8192) return json({error:'Twitch profile authorization is missing. Reload the Extension.'},400);
      const res=await fetch(`https://api.twitch.tv/helix/users?id=${id}`,{headers:{Authorization:`Extension ${body.helixToken}`,'Client-Id':this.env.EXTENSION_CLIENT_ID}});
      if (!res.ok) return json({error:'Could not verify your Twitch display name. Reload the Extension and try again.'},502);
      const profile=(await res.json() as {data:{id:string;display_name:string}[]}).data?.[0];
      if (profile?.id!==id||typeof profile.display_name!=='string'||!profile.display_name.length) return json({error:'Twitch profile did not match your identity.'},403);
      name=profile.display_name;this.profiles[id]={name,at:Date.now()};
    }
    // The profile request may cross the deadline or a host command.
    this.advance();
    if (!current()) return json({error:'The round closed while your profile loaded. Your vote was not counted.'},409);
    const result=vote(this.game,id,name,body.choice,Date.now());await this.publish();
    return json({...this.viewer(claims),accepted:result==='accepted',message:result==='accepted'?`Vote ${body.choice} locked in. You can change it until time runs out.`:'Voting has closed.'});
  }
  async fetch(req:Request):Promise<Response> {
    const url=new URL(req.url),path=url.pathname;
    if (path==='/internal/init') {
      if (this.control) return json({error:'Already initialized'},409);
      this.demo=true;this.control=(await req.json() as {control:string}).control;await this.persist();return json({ok:true});
    }
    if (path==='/internal/redeem') {
      const {ticket}=await req.json() as {ticket:string},valid=this.tickets[ticket]>Date.now();
      delete this.tickets[ticket];await this.persist();return json({ok:valid},valid?200:401);
    }
    if (path.startsWith('/internal/extension/')) {
      const {claims,body}=await req.json() as {claims:ExtensionClaims;body:Record<string,unknown>};
      return this.extensionAction(path.split('/').at(-1)!,claims,body);
    }
    const admin=this.demo?!!this.control&&req.headers.get('Authorization')===`Bearer ${this.control}`:req.headers.get('x-owner')==='true';
    if (!admin&&url.searchParams.get('token')!==this.readToken) return json({error:'Open live controls from the Twitch Extension, or use a valid display link.'},401);
    this.advance();
    if (path==='/access') return admin?json({readToken:this.readToken}):json({error:'Control access required.'},403);
    if (path==='/questions') return admin?json({questions:this.game.customQuestions??[]}):json({error:'Control access required.'},403);
    if (path==='/state') return json(this.view());
    if (path==='/ws') {
      if (req.headers.get('Upgrade')!=='websocket') return json({error:'WebSocket required'},426);
      const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);pair[1].send(JSON.stringify(this.view()));
      return new Response(null,{status:101,webSocket:pair[0]});
    }
    if (path==='/command') {
      if (!admin) return json({error:'Control access required.'},403);
      try {
        const c=await req.json() as Command;
        if (!['start','next','end','welcome','automation','questions','settings'].includes(c.type)) throw new Error('Unknown command.');
        if (!this.demo&&!configured(this.env)) throw new Error('Connect your Twitch Extension before starting.');
        const freshGame=c.type==='start'&&!this.game.interrupted;
        command(this.game,c,Date.now());
        if(freshGame)this.profiles={};
        if (this.demo&&this.game.phase==='voting'&&['start','next'].includes(c.type)) this.scheduleDemo();
        if (c.type==='end'||c.type==='welcome') {this.demoPlan=[];this.profiles={};}
        await this.publish();await this.ctx.storage.setAlarm(Date.now()+300);return json(this.view());
      } catch(error) {return json({error:error instanceof Error?error.message:'Invalid command'},409);}
    }
    return json({error:'Not found'},404);
  }
  webSocketMessage() { /* Display connections are read-only. */ }
  webSocketClose(socket:WebSocket) {socket.close();}
  scheduleDemo() {
    const names=['pixelpilot','noodleknight','cosmictoast','lunarcat','sneakysquid','mossboss','neonfox','wafflewizard','tinychaos','sleepybyte'];
    const players=this.game.round===1?Array.from({length:100},(_,i)=>({id:`fake-${i}`,name:`${names[i%names.length]}${String(i+1).padStart(2,'0')}`,alive:true})):Object.values(this.game.players).filter(p=>p.alive);
    const now=Date.now(),duration=this.game.settings.seconds*1000;this.demoPlan=[];
    for(const p of players) {
      if(this.game.round>1&&Math.random()<0.04) continue;
      const text=Math.random()<0.64?'A':'B',at=now+700+Math.random()*(duration-1800);
      this.demoPlan.push({id:p.id,name:p.name,text,at});
      if(Math.random()<0.18) this.demoPlan.push({id:p.id,name:p.name,text:text==='A'?'B':'A',at:Math.min(at+1000+Math.random()*3000,this.game.deadline-200)});
    }
    const ghost=Object.values(this.game.players).find(p=>!p.alive);
    if(ghost) this.demoPlan.push({id:ghost.id,name:ghost.name,text:'A',at:now+4000});
    if(this.game.round>1) this.demoPlan.push({id:'late-viewer',name:'fashionablylate',text:'B',at:now+8000});
    this.demoPlan.sort((a,b)=>a.at-b.at);
  }
  async alarm() {
    const now=Date.now();
    if(this.demo) while(this.demoPlan.length&&this.demoPlan[0].at<=now) {const event=this.demoPlan.shift()!;vote(this.game,event.id,event.name,event.text,event.at);}
    this.advance();
    await this.publish();
    if(this.game.phase==='voting'||this.game.phase==='reveal'||this.game.phase==='results'&&this.game.nextRoundAt) await this.ctx.storage.setAlarm(Date.now()+500);
  }
}
