export interface ExtensionClaims {
  channel_id: string;
  exp: number;
  role: 'viewer' | 'moderator' | 'broadcaster';
  opaque_user_id: string;
  user_id?: string;
}
export class ExtensionAuthError extends Error {}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
/** Verify Twitch's signature before trusting any identity, role or channel claims. */
export async function verifyExtensionToken(token: string, secret: string, channel: string, now = Date.now()): Promise<ExtensionClaims> {
  try {
    if (!token || token.length>8192 || !secret || !/^\d+$/.test(channel)) throw new Error();
    const parts = token.split('.');
    if (parts.length!==3) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (header.alg!=='HS256' || header.crit) throw new Error();
    const key = await crypto.subtle.importKey('raw',decode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if (!await crypto.subtle.verify('HMAC',key,decode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error();
    const c = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (!Number.isFinite(c.exp) || c.exp*1000<=now ||
        (c.nbf!==undefined && (!Number.isFinite(c.nbf) || c.nbf*1000>now)) || c.channel_id!==channel ||
        !['viewer','moderator','broadcaster'].includes(c.role) || typeof c.opaque_user_id!=='string' || !/^[UA][a-zA-Z0-9_-]{1,255}$/.test(c.opaque_user_id) ||
        (c.user_id!==undefined && (typeof c.user_id!=='string' || !/^\d+$/.test(c.user_id)))) throw new Error();
    return c as ExtensionClaims;
  } catch {throw new ExtensionAuthError('Your Twitch authorization expired or is invalid. Reload the Extension.');}
}
export function isBroadcaster(c: ExtensionClaims) {return c.role==='broadcaster' && c.opaque_user_id===`U${c.channel_id}`;}
export function linkedUserId(c: ExtensionClaims) {return c.opaque_user_id.startsWith('U') ? c.user_id : undefined;}
