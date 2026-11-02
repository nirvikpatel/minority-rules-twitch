import {describe,it,expect,vi,afterEach} from 'vitest';
import {verifyExtensionToken,isBroadcaster,linkedUserId,type ExtensionClaims} from '../worker/extension-auth';
import worker,{GameRoom} from '../worker/index';
import {command,tick} from '../src/engine';
const secret=btoa('test-only-secret-never-deploy-this-value');
const base:ExtensionClaims={channel_id:'123',exp:2000000000,role:'viewer',opaque_user_id:'Uabc',user_id:'456'};
async function jwt(claims:object=base,algorithm='HS256',keyValue=secret) {
  const encode=(value:unknown)=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const content=`${encode({alg:algorithm,typ:'JWT'})}.${encode(claims)}`;
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(keyValue),c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(content)));
  return `${content}.${btoa(String.fromCharCode(...signature)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}`;
}
function makeRoom() {
  const memory=new Map<string,unknown>();let loading:Promise<unknown>=Promise.resolve();
  const context={storage:{get:async(key:string)=>memory.get(key),put:async(key:string,value:unknown)=>{memory.set(key,structuredClone(value));},setAlarm:async()=>{}},getWebSockets:()=>[],blockConcurrencyWhile:(fn:()=>Promise<unknown>)=>{loading=fn();}} as unknown as DurableObjectState;
  const env={EXTENSION_CLIENT_ID:'extension123',EXTENSION_SECRET:secret,BROADCASTER_ID:'123',APP_ORIGIN:'https://game.test',SESSION_SECRET:'test-only-session-secret-with-more-than32-characters'};
  const room=new GameRoom(context,env as never);
  return {room,ready:()=>loading,env:{...env,GAME:{idFromName:()=>0,get:()=>({fetch:(req:Request)=>room.fetch(req)})},ASSETS:{fetch:async()=>new Response('asset')}} as never,memory};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('Twitch Extension authorization',()=>{
  it('accepts signed, current tokens for this channel',async()=>{expect(await verifyExtensionToken(await jwt(),secret,'123',1800000000000)).toEqual(base);});
  it.each(['U-viewer_abc-123','A-anonymous_abc-123'])('accepts Twitch opaque identity %s before identity sharing',async(opaque_user_id)=>{
    const claims={...base,opaque_user_id,user_id:undefined};
    const verified=await verifyExtensionToken(await jwt(claims),secret,'123',1800000000000);
    expect(verified.opaque_user_id).toBe(opaque_user_id);
    expect(linkedUserId(verified)).toBeUndefined();
    expect(isBroadcaster(verified)).toBe(false);
  });
  it.each(['wrong-secret','expired','wrong-channel','none','external','future','anonymous-id-mismatch','invalid-user'])('rejects %s',async(kind)=>{
    let c:Record<string,unknown>={...base},alg='HS256',key=secret;
    if(kind==='wrong-secret')key=btoa('different-secret');if(kind==='expired')c.exp=1;if(kind==='wrong-channel')c.channel_id='789';if(kind==='none')alg='none';if(kind==='external')c.role='external';if(kind==='future')c.nbf=2100000000;if(kind==='anonymous-id-mismatch')c.opaque_user_id={};if(kind==='invalid-user')c.user_id='__proto__';
    await expect(verifyExtensionToken(await jwt(c,alg,key),secret,'123',1800000000000)).rejects.toThrow();
  });
  it('requires a broadcaster role and the channel owner opaque identity',()=>{expect(isBroadcaster({...base,role:'broadcaster',opaque_user_id:'U123'})).toBe(true);expect(isBroadcaster({...base,role:'broadcaster'})).toBe(false);expect(isBroadcaster({...base,role:'moderator',opaque_user_id:'U123'})).toBe(false);});
  it('anonymous and unlinked viewers cannot acquire a player identity',()=>{expect(linkedUserId({...base,user_id:undefined})).toBeUndefined();expect(linkedUserId({...base,opaque_user_id:'Aanonymous'})).toBeUndefined();});
});
describe('Extension gateway and game',()=>{
  it('keeps the custom library restricted to the streamer',async()=>{
    const {room,ready}=makeRoom();await ready();
    command(room.game,{type:'questions',version:0,questions:[{id:'q',pack:'custom',prompt:'Private upcoming question',a:'A',b:'B'}]},Date.now());
    const viewer=await room.fetch(new Request(`https://room/questions?token=${room.readToken}`));expect(viewer.status).toBe(403);
    const owner=await room.fetch(new Request('https://room/questions',{headers:{'x-owner':'true'}}));expect(owner.status).toBe(200);
    expect(JSON.stringify(room.viewer(base))).not.toContain('Private upcoming question');
  });
  it('restores the pending auto-next alarm after a restart',async()=>{
    const {room,ready,memory,env}=makeRoom();await ready();
    room.game.phase='results';room.game.nextRoundAt=Date.now()+30000;room.game.settings.autoNext=true;await room.persist();
    const setAlarm=vi.fn(),pending:Promise<unknown>[]=[];
    const ctx={storage:{get:async(key:string)=>memory.get(key),setAlarm},blockConcurrencyWhile:(fn:()=>Promise<unknown>)=>{pending.push(fn());}} as unknown as DurableObjectState;
    const restored=new GameRoom(ctx,env);await Promise.all(pending);
    expect(restored.game.nextRoundAt).toBe(room.game.nextRoundAt);expect(setAlarm).toHaveBeenCalledOnce();
  });
  it('lets an unlinked viewer with a hyphenated ID load state and receive the identity prompt',async()=>{
    const {env}=makeRoom();
    const token=await jwt({...base,opaque_user_id:'U-viewer_123',user_id:undefined});
    const res=await worker.fetch(new Request('https://game.test/api/extension/state',{headers:{Authorization:`Bearer ${token}`,Origin:'https://extension123.ext-twitch.tv'}}),env);
    expect(res.status).toBe(200);
    expect((await res.json() as {you:{status:string}}).you.status).toBe('identity');
    const vote=await worker.fetch(new Request('https://game.test/api/extension/vote',{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:'https://extension123.ext-twitch.tv','Content-Type':'application/json'},body:JSON.stringify({choice:'A',round:1,version:0})}),env);
    expect(vote.status).toBe(403);
  });
  it('handles CDN preflights and rejects foreign origins',async()=>{const {env}=makeRoom();const good=await worker.fetch(new Request('https://game.test/api/extension/vote',{method:'OPTIONS',headers:{Origin:'https://extension123.ext-twitch.tv'}}),env);expect(good.status).toBe(204);expect(good.headers.get('Access-Control-Allow-Origin')).toBe('https://extension123.ext-twitch.tv');const bad=await worker.fetch(new Request('https://game.test/api/extension/state',{headers:{Origin:'https://evil.test'}}),env);expect(bad.status).toBe(403);});
  it('viewers cannot mint control links or access the OBS token',async()=>{const {env}=makeRoom();const token=await jwt();for(const action of ['launch','access']){const res=await worker.fetch(new Request(`https://game.test/api/extension/${action}`,{method:action==='launch'?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Origin:'https://extension123.ext-twitch.tv'},body:action==='launch'?'{}':undefined}),env);expect(res.status).toBe(403);}});
  it('broadcaster tickets are single-use and expire',async()=>{const {room,ready}=makeRoom();await ready();const c={...base,role:'broadcaster',opaque_user_id:'U123'} as ExtensionClaims;const response=await room.extensionAction('launch',c,{});const {url}=await response.json() as {url:string};const ticket=new URL(url).searchParams.get('ticket');const redeem=()=>room.fetch(new Request('https://room/internal/redeem',{method:'POST',body:JSON.stringify({ticket})}));expect((await redeem()).status).toBe(200);expect((await redeem()).status).toBe(401);room.tickets.expired=Date.now()-1;expect((await room.fetch(new Request('https://room/internal/redeem',{method:'POST',body:JSON.stringify({ticket:'expired'})}))).status).toBe(401);});
  it('verifies names with Twitch, replaces votes, and returns only the caller’s choice',async()=>{
    const {room,ready}=makeRoom();await ready();command(room.game,{type:'start',version:0},Date.now());
    const fetchMock=vi.fn().mockResolvedValue(Response.json({data:[{id:'456',display_name:'RealViewer'}]}));vi.stubGlobal('fetch',fetchMock);
    let response=await room.extensionAction('vote',base,{choice:'A',round:1,version:room.game.version,helixToken:'test-helix',user_id:'789',name:'ForgedName'});
    expect(response.status).toBe(200);expect(room.game.players['456'].name).toBe('RealViewer');expect(room.game.players['789']).toBeUndefined();
    response=await room.extensionAction('vote',base,{choice:'B',round:1,version:room.game.version});const data=await response.json() as {you:{choice:string};game:Record<string,unknown>};
    expect(Object.keys(room.game.votes)).toHaveLength(1);expect(data.you.choice).toBe('B');expect(data.game.result).toBeUndefined();expect(data.game.votes).toBeUndefined();expect(fetchMock).toHaveBeenCalledTimes(1);
    const other=await (await room.extensionAction('state',{...base,user_id:'789',opaque_user_id:'Uother'},{})).json() as {you:{choice?:string}};expect(other.you.choice).toBeUndefined();
  });
  it('rejects wrong-round, unlinked, and mismatched-profile submissions',async()=>{
    const {room,ready}=makeRoom();await ready();command(room.game,{type:'start',version:0},Date.now());
    expect((await room.extensionAction('vote',base,{choice:'A',round:2,version:1})).status).toBe(409);
    expect((await room.extensionAction('vote',{...base,user_id:undefined},{choice:'A',round:1,version:1})).status).toBe(403);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[{id:'999',display_name:'WrongUser'}]})));
    expect((await room.extensionAction('vote',base,{choice:'A',round:1,version:1,helixToken:'test'})).status).toBe(403);expect(Object.keys(room.game.votes)).toHaveLength(0);
  });
  it('checks deadlines again after a slow Twitch profile lookup',async()=>{
    const {room,ready}=makeRoom();await ready();command(room.game,{type:'start',version:0},Date.now());
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>{room.game.deadline=Date.now()-1;return Response.json({data:[{id:'456',display_name:'LateViewer'}]});}));
    expect((await room.extensionAction('vote',base,{choice:'A',round:1,version:1,helixToken:'test'})).status).toBe(409);expect(Object.keys(room.game.votes)).toHaveLength(0);
  });
  it('rejects eliminated and late voters with personal feedback and no vote mutation',async()=>{
    const {room,ready}=makeRoom();await ready();command(room.game,{type:'start',version:0},Date.now());
    for(let i=0;i<10;i++){room.game.players[String(i)]={id:String(i),name:`Viewer${i}`,alive:true};room.game.votes[String(i)]=i<6?'A':'B';}
    tick(room.game,room.game.deadline);tick(room.game,room.game.revealAt+6500);command(room.game,{type:'next',version:room.game.version},Date.now());
    const ghost=await (await room.extensionAction('vote',{...base,user_id:'0'},{choice:'A',round:2,version:room.game.version})).json() as {accepted:boolean;message:string};expect(ghost.accepted).toBe(false);expect(ghost.message).toContain('Ghosts');
    const late=await (await room.extensionAction('vote',base,{choice:'B',round:2,version:room.game.version})).json() as {accepted:boolean;you:{status:string}};expect(late.you.status).toBe('spectator');expect(late.accepted).toBe(false);expect(Object.keys(room.game.votes)).toHaveLength(0);
  });
  it('rehydrates an active live round without voiding it',async()=>{
    const {room,ready,memory,env}=makeRoom();await ready();command(room.game,{type:'start',version:0},Date.now());room.game.players['456']={id:'456',name:'Viewer',alive:true};room.game.votes['456']='B';await room.persist();
    let loaded:Promise<unknown>=Promise.resolve();const ctx={storage:{get:async(key:string)=>memory.get(key),setAlarm:async()=>{}},blockConcurrencyWhile:(fn:()=>Promise<unknown>)=>{loaded=fn();}} as unknown as DurableObjectState;
    const next=new GameRoom(ctx,env);await loaded;expect(next.game.deadline).toBe(room.game.deadline);expect(next.game.votes['456']).toBe('B');expect(next.game.phase).toBe('voting');
  });
});
