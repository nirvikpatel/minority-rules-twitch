import type {Snapshot} from '../src/engine';
export const API = 'https://minority-rules.nirvik.workers.dev';
export interface TwitchAuth {channelId:string;clientId:string;token:string;helixToken:string;userId:string}
interface TwitchHelper {
  onAuthorized(callback:(auth:TwitchAuth)=>void):void;
  onError(callback:(error:unknown)=>void):void;
  actions:{requestIdShare():void};
  viewer:{id:string|null;isLinked:boolean;role:string};
}
declare global {interface Window {Twitch?:{ext:TwitchHelper}}}
export interface ViewerState {
  game:Snapshot&{demo:boolean;connection:string};
  you:{status:'identity'|'waiting'|'alive'|'out'|'spectator'|'winner';name?:string;choice?:'A'|'B'};
  accepted?:boolean;message?:string;
}
export const escape = (value:unknown) => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function api<T>(path:string,auth:TwitchAuth,body?:unknown):Promise<T> {
  const response=await fetch(`${API}/api/extension/${path}`,{
    method:body===undefined?'GET':'POST',credentials:'omit',
    headers:{Authorization:`Bearer ${auth.token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json() as T&{error?:string};
  if(!response.ok) throw new Error(data.error??'Could not reach the game. Try again.');
  return data;
}
