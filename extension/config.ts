import {api,escape,type TwitchAuth} from './shared';
import './style.css';
import './depth.css';
const root=document.querySelector<HTMLElement>('#extension')!;
let auth:TwitchAuth|undefined;
root.innerHTML=`<header><span class="wordmark">Minority Rules</span></header><section class="setup"><h1>Ready to play?</h1><p>Choose questions, start rounds, and set up your stream from the game controls.</p><div id="launch-result" aria-live="polite"></div><button id="launch" class="primary" disabled>Open game controls</button><p class="setup-note">Viewers vote with A/B buttons on your channel. They don’t need to install anything.</p><details><summary>Connection details</summary><div id="identity" class="setup-box">Waiting for Twitch…</div></details><a class="preview-link" href="https://minority-rules.nirvik.workers.dev/extension/viewer.html?preview=1" target="_blank" rel="noopener noreferrer">Preview the voting panel ↗</a></section>`;
const button=root.querySelector<HTMLButtonElement>('#launch')!,result=root.querySelector<HTMLElement>('#launch-result')!;
window.Twitch?.ext.onAuthorized(next=>{
  auth=next;
  root.querySelector('#identity')!.innerHTML=`<span>Channel ID</span><code>${escape(next.channelId)}</code><span>Extension ID</span><code>${escape(next.clientId)}</code>`;
  button.disabled=window.Twitch?.ext.viewer.role!=='broadcaster';
  if(button.disabled)result.textContent='Only the broadcaster can open game controls.';
});
button.addEventListener('click',async()=>{
  if(!auth)return;
  button.disabled=true;result.textContent='Connecting…';
  try{
    const data=await api<{url:string}>('launch',auth,{}),url=new URL(data.url);
    if(url.origin!=='https://minority-rules.nirvik.workers.dev')throw new Error('Unexpected control-panel address.');
    result.innerHTML=`<a class="primary continue" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Continue to game controls ↗</a><p class="setup-note">This link works once and expires in one minute.</p>`;
    button.textContent='Get a new link';button.className='secondary';
  }catch(error){result.textContent=(error as Error).message;}
  finally{button.disabled=false;}
});
