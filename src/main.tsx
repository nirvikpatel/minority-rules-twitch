import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Check, Copy, ExternalLink, Volume2, VolumeX} from 'lucide-react';
import {createGame, snapshot, type Command, type Settings, type Snapshot} from './engine';
import {packNames, type Pack, type Question} from './questions';
import './style.css';
import './depth.css';
import './confetti.css';
import './welcome.css';
import {CONFETTI_PARTICLES} from './confetti';

type View = Snapshot & {demo: boolean; connection: string};
type Room = {id: string; control?: string; readToken?: string};
const params = new URLSearchParams(location.search);
const display = location.pathname === '/display';
const blank: View = {...snapshot(createGame(), Date.now()), demo: true, connection: 'simulated'};
function readSaved(): Room | null {
  try {return JSON.parse(localStorage.getItem('minority-room') ?? 'null');} catch {return null;}
}
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json() as T & {error?: string};
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data;
}

function App() {
  const [room, setRoom] = useState<Room | null>(() => display
    ? {id: params.get('room') ?? 'live', readToken: params.get('token') ?? ''}
    : params.get('mode') === 'live' ? {id: 'live'} : readSaved());
  const [view, setView] = useState<View>(room?.id === 'live' ? {...blank, demo: false, connection: 'unconfigured'} : blank);
  const [settings, setSettings] = useState<Settings>(blank.settings);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const offset = useRef(0), lastCue = useRef(''), serverSettings = useRef('');
  const audio = useRef<AudioContext | null>(null);
  const generation = useRef(0);
  const base = room ? `/api/room/${room.id}` : '';
  function update(data: View) {
    offset.current = data.serverNow - Date.now();
    setView(data);
    const serialized = JSON.stringify(data.settings);
    if (serialized !== serverSettings.current) {serverSettings.current = serialized; setSettings(data.settings);}
    setNow(Date.now() + offset.current);
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!room) return;
    serverSettings.current = '';
    const gen = ++generation.current;
    let closed = false, socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        let token = room!.readToken;
        const headers: Record<string,string> = room!.control ? {Authorization: `Bearer ${room!.control}`} : {};
        if (!display && !token) {
          token = (await request<{readToken: string}>(`${base}/access`, {headers})).readToken;
          room!.readToken = token;
        }
        const data = await request<View>(`${base}/state?token=${encodeURIComponent(token ?? '')}`, {headers});
        if (closed || gen !== generation.current) return;
        update(data); setError('');
        const url = new URL(`${base}/ws`, location.origin);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('token', token ?? '');
        socket = new WebSocket(url);
        socket.onopen = () => {if (!closed) setOnline(true);};
        socket.onmessage = event => {if (!closed) update(JSON.parse(event.data));};
        socket.onclose = () => {if (!closed) {setOnline(false); timer = setTimeout(connect, 2000);}};
        socket.onerror = () => socket?.close();
      } catch (e) {
        if (!closed) {setOnline(false); setError((e as Error).message); timer = setTimeout(connect, 5000);}
      }
    }
    void connect();
    return () => {closed = true; clearTimeout(timer); socket?.close(); setOnline(false);};
  }, [room?.id, room?.control]);
  useEffect(() => {
    if (!sound || !view.settings.sound) return;
    const seconds = Math.ceil((view.deadline - now) / 1000);
    const cue = view.phase === 'voting' && seconds > 0 && seconds <= 5 ? `tick-${view.round}-${seconds}`
      : view.phase === 'reveal' && view.result ? `reveal-${view.round}` : view.phase === 'winners' ? `win-${view.round}` : '';
    if (!cue || cue === lastCue.current) return;
    lastCue.current = cue;
    try {
      const ctx = audio.current ?? new AudioContext(); audio.current = ctx; void ctx.resume();
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.frequency.value = view.phase === 'winners' ? 880 : view.result ? 220 : 520;
      gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(); oscillator.stop(ctx.currentTime + 0.3);
    } catch { /* Optional audio. */ }
  }, [view.phase, view.round, view.result, view.deadline, now, sound, view.settings.sound]);

  function post(target: Room, type: Command['type'], version: number, extra:Partial<Command>={}) {
    return request<View>(`/api/room/${target.id}/command`, {
      method: 'POST', headers: {'Content-Type': 'application/json', ...(target.control ? {Authorization: `Bearer ${target.control}`} : {})},
      body: JSON.stringify({type, version, ...(type === 'settings' ? {settings} : {}),...extra}),
    });
  }
  async function newDemo(start = false) {
    setBusy(true); setError('');
    try {
      const next = await request<Room>('/api/demo', {method: 'POST'});
      let initial = await post(next, 'settings', 0);
      if (start) initial = await post(next, 'start', initial.version);
      localStorage.setItem('minority-room', JSON.stringify(next));
      setRoom(next); update(initial); history.replaceState(null, '', '/');
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function send(type: Command['type']) {
    if (!room) return;
    setBusy(true); setError('');
    try {
      let version = view.version;
      if (type === 'start' && view.phase === 'waiting' && JSON.stringify(settings) !== JSON.stringify(view.settings)) {
        version = (await post(room, 'settings', version)).version;
      }
      update(await post(room, type, version));
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function automation(enabled:boolean,delay:number) {
    if(!room)return;
    const draft=settings;
    setBusy(true);setError('');
    try{update(await post(room,'automation',view.version,{autoNext:enabled,autoNextSeconds:delay}));setSettings({...draft,autoNext:enabled,autoNextSeconds:delay});}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function saveQuestions(questions:Question[]) {
    if(!room)return;
    setBusy(true);setError('');
    try{update(await post(room,'questions',view.version,{questions}));}
    catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}
  }
  const obsUrl = room?.readToken ? `${location.origin}/display?room=${room.id}&token=${room.readToken}` : '';
  const editable = view.phase === 'waiting' && !view.interrupted;
  const canStart = ['waiting', 'winners', 'wipeout'].includes(view.phase);
  const playable = online && (view.demo || view.connection === 'extension');
  const phaseLabel = view.phase === 'voting' ? 'Voting is open' : view.phase === 'reveal' ? 'Revealing results'
    : view.phase === 'results' ? 'Ready for the next round' : view.phase === 'winners' || view.phase === 'wipeout' ? 'Game over' : 'Ready to start';
  if (display) return <main className="display-page">
    <Stage view={view} now={now} online={online}/>
    {error && <div className="display-warning">{error}</div>}
    <button className="display-audio" aria-label="Toggle display sound" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
  </main>;

  return <div className="app">
    <header className="app-header">
      <a href="/" className="brand">Minority Rules<span>Choose less. Survive longer.</span></a>
      <div className="mode-switch" aria-label="Game mode">
        <button aria-pressed={view.demo} onClick={() => {if (!view.demo) void newDemo();}} disabled={busy}>Demo</button>
        <button aria-pressed={!view.demo} disabled={busy} onClick={() => {if(view.demo){setRoom({id:'live'}); setView({...blank,demo:false,connection:'unconfigured'}); history.replaceState(null,'','/?mode=live');}}}>Twitch</button>
      </div>
    </header>
    <main>
      <div className="page-title"><div><h1>Run your game</h1><p>The less popular answer survives.</p></div><span className={`connection ${online ? 'connected' : ''}`}>{!room ? 'Demo ready' : online ? view.demo ? 'Demo · 100 simulated players' : 'Twitch connected' : 'Connecting…'}</span></div>
      {error && <div role="alert" className="error">{error}{!view.demo && <span> Open Minority Rules from your Twitch Extension’s configuration to access live controls.</span>}</div>}
      <div className="workspace">
        <section className="preview">
          <div className="section-heading"><h2>Stream preview</h2><div className="preview-actions">
            <button className="icon-button" aria-label="Toggle preview sound" title="Preview sound" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button>
            {obsUrl && <a aria-label="Open stream display" href={obsUrl} target="_blank" rel="noreferrer"><ExternalLink size={17}/></a>}
          </div></div>
          <Stage view={view} now={now} online={online}/>
          <p className="preview-note">Viewers vote in the Twitch panel. This screen is for your stream.</p>
          {view.history.length > 0 && <details className="history"><summary>Round history <span>{view.history.length}</span></summary><div>{view.history.map(item => <p key={item.round}><span>Round {item.round}</span><b>{item.result.survivors} survived</b><span>{item.result.a} A · {item.result.b} B</span></p>)}</div></details>}
        </section>
        <aside className="controls">
          <section className="card">
            <div className="control-heading"><h2>Game settings</h2><span>{view.demo ? 'Demo' : 'Live'}</span></div>
            <label htmlFor="pack">Questions</label>
            <select id="pack" aria-label="Question pack" value={settings.pack} disabled={!editable || busy} onChange={event => setSettings({...settings,pack:event.target.value as Pack})}>{Object.entries(packNames).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select>
            <label htmlFor="seconds">Seconds per round</label>
            <input id="seconds" aria-label="Round duration in seconds" type="number" min="15" max="90" value={settings.seconds} disabled={!editable || busy} onChange={event => setSettings({...settings,seconds:Number(event.target.value)})}/>
            <p className="field-help">15–90 seconds. Settings save when you start.</p>
            <label className="checkbox"><input type="checkbox" checked={settings.sound} disabled={!editable || busy} onChange={event => setSettings({...settings,sound:event.target.checked})}/> Sound effects</label>
            <label className="checkbox"><input type="checkbox" checked={!!view.settings.autoNext} disabled={!room||busy||!online} onChange={event=>automation(event.target.checked,view.settings.autoNextSeconds??30)}/> Auto-next round</label>
            {view.settings.autoNext&&<><label htmlFor="auto-delay">Pause between rounds</label><select id="auto-delay" value={view.settings.autoNextSeconds??30} disabled={busy} onChange={event=>automation(true,Number(event.target.value))}>{[5,10,15,30,45,60,90,120].map(n=><option key={n} value={n}>{n} seconds</option>)}</select><p className="field-help">Starts after the reveal. Stops at winners or nobody survived. Never starts a new game.</p></>}
            <div className="game-actions">
              <p className="phase-label" role="status">{phaseLabel}</p>
              <button className="primary" disabled={busy || (!!room && (!playable || (!canStart && view.phase !== 'results')))} onClick={() => !room ? newDemo(true) : send(view.phase === 'results' ? 'next' : 'start')}>
                {busy ? 'Please wait…' : !room ? 'Start demo' : view.phase === 'results' ? 'Next round' : view.interrupted ? 'Restart round' : canStart ? 'Start game' : view.phase === 'voting' ? 'Voting…' : 'Revealing…'}
              </button>
              {room && (view.phase !== 'waiting' || view.interrupted) && <button className="text-button stop" disabled={busy || !online} onClick={() => send('end')}>End game</button>}
              {room&&<button className="welcome-button" disabled={busy||!online||!canStart||view.interrupted} onClick={()=>send('welcome')}>Welcome screen</button>}
            </div>
          </section>
          {room&&<QuestionEditor key={room.id} room={room} editable={editable&&!busy} count={view.customCount} save={saveQuestions}/>}
          <details className="card obs"><summary>Add to OBS</summary><p>Use a Browser Source at 1920 × 1080.</p><div className="copy-field"><input aria-label="OBS display URL" readOnly value={obsUrl} placeholder="Start a demo to get your link"/><button aria-label="Copy OBS URL" disabled={!obsUrl} onClick={async () => {try {await navigator.clipboard.writeText(obsUrl); setCopied(true); setTimeout(() => setCopied(false),2000);} catch {setError('Copy the display URL manually from the field.');}}}>{copied ? <Check size={16}/> : <Copy size={16}/>}</button></div><p className="field-help">{copied ? 'Link copied.' : 'Your display link has no game controls.'}</p></details>
          <a className="viewer-link" href="/extension/viewer.html?preview=1" target="_blank" rel="noreferrer">Preview viewer voting <ExternalLink size={13}/></a>
          <details className="help"><summary>How does it work?</summary><p>Viewers join by voting in round 1. The smaller side survives; ties keep both sides alive. Missing a round eliminates you. The last 1–3 players win.</p><p>Only the streamer installs the Extension. In Hosted Test, each viewer must also be allowlisted.</p></details>
        </aside>
      </div>
    </main>
  </div>;
}

function QuestionEditor({room,editable,count,save}:{room:Room;editable:boolean;count:number;save:(questions:Question[])=>Promise<void>}) {
  const [rows,setRows]=useState<Question[]>([]),[loaded,setLoaded]=useState(false),[message,setMessage]=useState('');
  const empty={prompt:'',a:'',b:''};
  const [draft,setDraft]=useState(empty),[editing,setEditing]=useState<number|null>(null);
  async function load(){try{const data=await request<{questions:Question[]}>(`/api/room/${room.id}/questions`,{headers:room.control?{Authorization:`Bearer ${room.control}`}:{}});setRows(data.questions);setLoaded(true);}catch(e){setMessage((e as Error).message);}}
  async function store(next:Question[]){try{await save(next);setRows(next.map((q,i)=>({...q,id:`custom-${i}`})));setEditing(null);setDraft(empty);setMessage('Saved. Select “My questions” in Game settings to play.');return true;}catch{return false;}}
  return <details className="card question-editor" onToggle={e=>{if(e.currentTarget.open&&!loaded)void load();}}><summary>My questions <span>{count}</span></summary>
    <p className="field-help">Create up to 50 questions. Show the welcome screen to edit between games.</p>
    {loaded&&<><div className="question-list">{rows.map((q,i)=><div key={q.id}><span>{i+1}. {q.prompt}<small>Minority survives</small></span><button disabled={!editable} onClick={()=>{setEditing(i);setDraft({prompt:q.prompt,a:q.a,b:q.b});setMessage('');}}>Edit</button><button aria-label={`Delete question ${i+1}`} disabled={!editable} onClick={()=>void store(rows.filter((_,n)=>n!==i))}>×</button></div>)}</div>
    <form onSubmit={async e=>{e.preventDefault();const q:Question={id:`custom-${rows.length}`,pack:'custom',prompt:draft.prompt,a:draft.a,b:draft.b};const next=[...rows];if(editing===null)next.push(q);else next[editing]=q;if(await store(next)){setDraft(empty);setEditing(null);}}}>
      <label htmlFor="custom-prompt">Question</label><input id="custom-prompt" required maxLength={200} disabled={!editable} value={draft.prompt} onChange={e=>setDraft({...draft,prompt:e.target.value})} placeholder="What will you ask your viewers?"/>
      <label htmlFor="custom-a">Option A</label><input id="custom-a" required maxLength={100} disabled={!editable} value={draft.a} onChange={e=>setDraft({...draft,a:e.target.value})}/>
      <label htmlFor="custom-b">Option B</label><input id="custom-b" required maxLength={100} disabled={!editable} value={draft.b} onChange={e=>setDraft({...draft,b:e.target.value})}/>
      <p className="field-help">The less popular answer survives. No correct answer needed.</p>
      <button className="primary" disabled={!editable||(editing===null&&rows.length>=50)}>{editing===null?'Add question':'Save question'}</button>
      {editing!==null&&<button type="button" className="text-button" onClick={()=>{setEditing(null);setDraft(empty);}}>Cancel edit</button>}
    </form></>}{message&&<p className="field-help" role="status">{message}</p>}
  </details>;
}

function Stage({view:v,now,online}:{view:View;now:number;online:boolean}) {
  const voting=v.phase==='voting', finished=v.phase==='winners'||v.phase==='wipeout', waiting=v.phase==='waiting';
  const seconds=Math.max(0,Math.ceil((v.deadline-now)/1000));
  const result=v.result;
  const progress=voting?Math.max(0,Math.min(100,(v.deadline-now)/(v.settings.seconds*1000)*100)):0;
  const headline=waiting?v.welcome?'The game will start soon':'Waiting to start':v.phase==='winners'?'The winners':v.phase==='wipeout'?'Nobody survived':v.question?.prompt;
  const hint=waiting?'Choose your side when the host starts.':v.phase==='winners'?'You survived the final round.':v.phase==='wipeout'?'Better luck next game.':voting?'Choose the less popular answer in the Twitch panel.':!result?'Votes closed. Revealing the results…':result.survivingSide==='tie'?'A tie. Both sides survive.':`${result.survivingSide} was the minority.`;
  return <div className={`stage phase-${v.phase} ${v.welcome?'is-welcome':''}`}>
    {v.welcome&&<div className="welcome-orbit" aria-hidden="true"><i/><i/><i/></div>}
    {v.phase==='winners'&&<div className="confetti" aria-hidden="true">{Array.from({length:CONFETTI_PARTICLES},(_,index)=><i key={index}/>)}</div>}
    <div className="stage-header"><span>Minority Rules</span><div>{v.demo && <span className="demo-tag">Demo</span>}{v.round>0 && <span>Round {v.round}</span>}{voting && <strong className={seconds<=5?'urgent':''}>{seconds}s</strong>}{!v.demo&&!online&&<span>Reconnecting…</span>}</div></div>
    <div className="stage-content">{v.phase==='winners'&&<div className="winner-emblem" aria-hidden="true">✦</div>}<h2>{headline}</h2><p className="stage-hint">{hint}</p>
      {v.welcome&&<div className="welcome-loader" aria-hidden="true"><i/><i/><i/></div>}
      {!waiting&&!finished&&<div className="stage-answers">{(['A','B'] as const).map(side => {
        const survives=result&&(result.survivingSide===side||result.survivingSide==='tie');
        return <div key={side} className={`stage-answer answer-${side.toLowerCase()} ${result?(survives?'survives':'eliminated'):''}`}><span className="letter">{side}</span><strong>{side==='A'?v.question?.a:v.question?.b}</strong>{result&&<div className="answer-result"><b>{side==='A'?result.a:result.b} votes</b><span>{survives?'Survives':'Eliminated'}</span></div>}</div>;
      })}</div>}
      {v.phase==='winners'&&<div className="winner-names">{v.winners.map(winner=><span key={winner.id}>{winner.name}</span>)}</div>}
      {voting&&<p className="stage-footnote">Vote totals stay hidden until the reveal.</p>}
      {v.phase==='results'&&v.nextRoundAt&&<p className="stage-footnote">Next round in {Math.max(0,Math.ceil((v.nextRoundAt-now)/1000))}s</p>}
      {v.toast&&<p className="game-toast" role="status">{v.toast.text}</p>}
      {v.notice&&<p className="stage-notice">{v.notice}</p>}
    </div>
    <div className="stage-footer"><span><b>{v.alive}</b> alive</span><span><b>{v.voted}</b> voted</span></div>
    <div className="timer-track"><i style={{width:`${progress}%`}}/></div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
