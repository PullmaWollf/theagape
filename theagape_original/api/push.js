// api/push.js — Envia push imediato (chamado pelo frontend ao postar Aviso)
import { createSign } from 'crypto';

const SUPA_URL  = process.env.SUPABASE_URL;
const SUPA_KEY  = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUB = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIV= process.env.VAPID_PRIVATE_KEY;
const VAPID_SUB = 'mailto:admin@celulaagape.app';

function b64u(buf) {
  return Buffer.from(buf).toString('base64url');
}

async function makeVapidJwt(audience) {
  const now     = Math.floor(Date.now() / 1000);
  const header  = b64u(Buffer.from(JSON.stringify({ typ:'JWT', alg:'ES256' })));
  const payload = b64u(Buffer.from(JSON.stringify({ aud:audience, exp:now+3600, sub:VAPID_SUB })));
  const toSign  = `${header}.${payload}`;

  // Reconstrói PKCS8 a partir dos 32 bytes raw da VAPID private key
  const privRaw = Buffer.from(VAPID_PRIV, 'base64url');
  // Prefixo PKCS8 padrão para EC P-256 + os 32 bytes da chave
  const pkcs8Prefix = Buffer.from(
    '308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420',
    'hex'
  );
  const pkcs8 = Buffer.concat([pkcs8Prefix, privRaw]);

  const sign = createSign('SHA256');
  sign.update(toSign);
  const sig = sign.sign({
    key: pkcs8,
    format: 'der',
    type: 'pkcs8',
    dsaEncoding: 'ieee-p1363'
  });

  return `${toSign}.${b64u(sig)}`;
}

async function sendPush(subJson, payload) {
  const sub      = typeof subJson === 'string' ? JSON.parse(subJson) : subJson;
  const endpoint = sub.endpoint;
  const audience = new URL(endpoint).origin;
  const jwt      = await makeVapidJwt(audience);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization':  `vapid t=${jwt},k=${VAPID_PUB}`,
      'Content-Type':   'application/json',
      'TTL':            '86400',
    },
    body: JSON.stringify(payload)
  });

  const ok = res.ok || res.status === 201;
  if (!ok) {
    const text = await res.text().catch(() => '');
    console.error(`[push] endpoint respondeu ${res.status}:`, text.substring(0, 200));
  }
  return { status: res.status, ok };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  try {
    const { payload, target_user_id } = req.body;
    if (!payload) return res.status(400).json({ error: 'payload obrigatório' });

    // Busca subscriptions
    let url = `${SUPA_URL}/rest/v1/push_subscriptions?select=*`;
    if (target_user_id) url += `&user_id=eq.${target_user_id}`;

    const r    = await fetch(url, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const subs = r.ok ? await r.json() : [];

    console.log(`[push] Enviando para ${subs.length} dispositivo(s)`, payload);

    if (!subs.length) return res.status(200).json({ sent:0, message:'Sem dispositivos cadastrados' });

    let sent = 0;
    for (const sub of subs) {
      try {
        const result = await sendPush(sub.subscription_json, payload);
        if (result.ok) {
          sent++;
        } else if (result.status === 410 || result.status === 404) {
          // Subscription expirada — remove do banco
          await fetch(`${SUPA_URL}/rest/v1/push_subscriptions?id=eq.${sub.id}`, {
            method: 'DELETE',
            headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
          });
          console.log('[push] Subscription expirada removida:', sub.id);
        }
      } catch(e) {
        console.error('[push] Erro ao enviar:', e.message);
      }
    }

    return res.status(200).json({ sent, total: subs.length });

  } catch(e) {
    console.error('[push] ERRO:', e);
    return res.status(500).json({ error: e.message });
  }
}
