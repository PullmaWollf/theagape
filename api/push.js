// api/push.js — Vercel Serverless Function
// Envia Web Push para um ou todos os dispositivos cadastrados
// Chamado pelo frontend quando: ADM posta aviso OU alarme de escala dispara

const SUPA_URL  = process.env.SUPABASE_URL;
const SUPA_KEY  = process.env.SUPABASE_SERVICE_KEY; // service_role key (não anon!)
const VAPID_PUB  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY;
const VAPID_MAIL = process.env.VAPID_CONTACT || 'mailto:admin@celulaagape.app';

// ── Web Push manual (sem dependência externa) ──
// Usa a Web Crypto API disponível no Node 18+ (Vercel Edge/Node runtime)
async function sendWebPush(subscription, payload) {
  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;

  // Importa chaves
  const serverPub  = b64uDecode(VAPID_PUB);
  const serverPriv = b64uDecode(VAPID_PRIV);

  // Gera par de chaves efêmero para ECDH
  const ephemeralKey = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);

  const ephemeralPubRaw = await crypto.subtle.exportKey('raw', ephemeralKey.publicKey);
  const clientPubKey    = await crypto.subtle.importKey('raw', b64uDecode(p256dh),
    { name:'ECDH', namedCurve:'P-256' }, false, []);

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name:'ECDH', public: clientPubKey }, ephemeralKey.privateKey, 256);

  // HKDF para content encryption key e nonce
  const authBuf = b64uDecode(auth);
  const prk     = await hkdf(sharedBits, authBuf, 'Content-Encoding: auth\0', 32);
  const cekInfo = buildInfo('aesgcm', ephemeralPubRaw, b64uDecode(p256dh));
  const cek     = await hkdf(prk, new Uint8Array(16), cekInfo, 16);
  const nonceInfo = buildInfo('nonce', ephemeralPubRaw, b64uDecode(p256dh));
  const nonce   = await hkdf(prk, new Uint8Array(16), nonceInfo, 12);

  // Criptografa payload
  const encoder  = new TextEncoder();
  const padded   = new Uint8Array([0, 0, ...encoder.encode(JSON.stringify(payload))]);
  const aesKey   = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, aesKey, padded);

  // VAPID JWT
  const jwt = await makeVapidJwt(endpoint, VAPID_PUB, VAPID_PRIV);

  // HTTP request
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption':     'salt=' + b64uEncode(new Uint8Array(16)),
      'Crypto-Key':     'dh=' + b64uEncode(new Uint8Array(ephemeralPubRaw)) + ';p256ecdsa=' + VAPID_PUB,
      'Authorization':  'WebPush ' + jwt,
      'TTL':            '86400',
    },
    body: encrypted
  });

  return { status: res.status, ok: res.ok };
}

// ── Helpers ──
function b64uDecode(str) {
  const b64 = str.replace(/-/g,'+').replace(/_/g,'/');
  const bin = atob(b64.padEnd(b64.length + (4 - b64.length%4)%4, '='));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function b64uEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function buildInfo(type, clientPub, serverPub) {
  const enc = new TextEncoder();
  const label = enc.encode('Content-Encoding: ' + type + '\0P-256\0');
  const buf = new Uint8Array(label.length + 2 + clientPub.byteLength + 2 + serverPub.byteLength);
  let off = 0;
  buf.set(label, off); off += label.length;
  new DataView(buf.buffer).setUint16(off, clientPub.byteLength); off += 2;
  buf.set(new Uint8Array(clientPub), off); off += clientPub.byteLength;
  new DataView(buf.buffer).setUint16(off, serverPub.byteLength); off += 2;
  buf.set(new Uint8Array(serverPub), off);
  return buf;
}
async function hkdf(ikm, salt, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'HKDF', hash:'SHA-256', salt, info }, key, len*8);
  return new Uint8Array(bits);
}
async function makeVapidJwt(endpoint, pubKey, privKeyB64u) {
  const url     = new URL(endpoint);
  const audience = url.protocol + '//' + url.hostname;
  const now      = Math.floor(Date.now()/1000);
  const header   = { typ:'JWT', alg:'ES256' };
  const claims   = { aud: audience, exp: now+3600, sub: VAPID_MAIL };
  const enc      = new TextEncoder();
  const toSign   = b64uEncode(enc.encode(JSON.stringify(header))) + '.' +
                   b64uEncode(enc.encode(JSON.stringify(claims)));
  const privDer  = b64uDecode(privKeyB64u);
  // Import as PKCS8 if 32 bytes raw, wrap it
  let privKey;
  try {
    privKey = await crypto.subtle.importKey('raw', privDer,
      { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
  } catch {
    // Already in correct format
    privKey = await crypto.subtle.importKey('pkcs8', privDer,
      { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
  }
  const sig = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' },
    privKey, enc.encode(toSign));
  return toSign + '.' + b64uEncode(sig);
}

// ── Supabase helpers ──
async function supaFetch(path, options={}) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    ...options,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers||{})
    }
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// ── Handler principal ──
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, payload, target_user_id } = req.body;
    // type: 'broadcast' (todos) | 'targeted' (um usuário)
    // payload: { title, body, url }

    // Busca subscriptions
    let q = 'push_subscriptions?select=*';
    if (type === 'targeted' && target_user_id) {
      q += '&user_id=eq.' + target_user_id;
    }
    const { data: subs, ok } = await supaFetch(q);
    if (!ok || !Array.isArray(subs)) {
      return res.status(500).json({ error: 'Falha ao buscar subscriptions' });
    }

    if (subs.length === 0) {
      return res.status(200).json({ sent: 0, message: 'Nenhum dispositivo cadastrado' });
    }

    // Envia para cada dispositivo
    const results = await Promise.allSettled(subs.map(async sub => {
      try {
        const subscription = JSON.parse(sub.subscription_json);
        const result = await sendWebPush(subscription, payload);
        // Remove subscription inválida (410 = dispositivo desinscrito)
        if (result.status === 410 || result.status === 404) {
          await supaFetch('push_subscriptions?id=eq.' + sub.id, { method: 'DELETE' });
        }
        return result;
      } catch(e) {
        return { ok: false, error: e.message };
      }
    }));

    const sent   = results.filter(r => r.status==='fulfilled' && r.value.ok).length;
    const failed = results.length - sent;

    return res.status(200).json({ sent, failed, total: subs.length });

  } catch(e) {
    console.error('[push]', e);
    return res.status(500).json({ error: e.message });
  }
}
