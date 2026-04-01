// api/cron-alarms.js
// Chamado pelo GitHub Actions a cada minuto
// Busca alarmes pendentes no Supabase e envia Web Push

export const config = { runtime: 'nodejs' };

const SUPA_URL  = process.env.SUPABASE_URL;
const SUPA_KEY  = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUB = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIV= process.env.VAPID_PRIVATE_KEY;
const VAPID_SUB = 'mailto:admin@celulaagape.app';

// ── Supabase helpers ──
async function supaGet(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
  return r.ok ? r.json() : [];
}
async function supaPatch(path, body) {
  await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
async function supaDelete(path) {
  await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
}

// ── VAPID JWT ──
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }

async function makeVapidJwt(audience) {
  const { createSign } = await import('crypto');
  const now     = Math.floor(Date.now() / 1000);
  const header  = b64u(Buffer.from(JSON.stringify({ typ:'JWT', alg:'ES256' })));
  const payload = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: now+3600, sub: VAPID_SUB })));
  const toSign  = `${header}.${payload}`;

  // Reconstrói PKCS8 a partir dos 32 bytes raw da chave privada
  const privRaw    = Buffer.from(VAPID_PRIV, 'base64url');
  const pkcs8Hdr   = Buffer.from('308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420','hex');
  const pkcs8      = Buffer.concat([pkcs8Hdr, privRaw]);

  const sign = createSign('SHA256');
  sign.update(toSign);
  const sig = sign.sign({ key: pkcs8, format:'der', type:'pkcs8', dsaEncoding:'ieee-p1363' });
  return `${toSign}.${b64u(sig)}`;
}

// ── Envia Web Push ──
async function sendPush(subJson, payload) {
  const sub      = typeof subJson === 'string' ? JSON.parse(subJson) : subJson;
  const endpoint = sub.endpoint;
  const audience = new URL(endpoint).origin;
  const jwt      = await makeVapidJwt(audience);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUB}`,
      'Content-Type':  'application/json',
      'TTL':           '86400',
    },
    body: JSON.stringify(payload)
  });
  return { status: res.status, ok: res.ok || res.status === 201 };
}

// ── Handler ──
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const agora  = new Date().toISOString();
    const limite = new Date(Date.now() - 120_000).toISOString();

    const alarms = await supaGet(
      `push_alarms?sent=eq.false&fire_at=lte.${agora}&fire_at=gte.${limite}&select=*`
    );

    if (!alarms.length) return res.status(200).json({ processed: 0 });

    let processed = 0;
    for (const alarm of alarms) {
      // Marca enviado antes de enviar (evita duplicata)
      await supaPatch(`push_alarms?id=eq.${alarm.id}`, { sent: true });

      const userIds = (alarm.target_user_ids || []);
      let subs = [];
      if (userIds.length > 0) {
        subs = await supaGet(`push_subscriptions?user_id=in.(${userIds.join(',')})&select=*`);
      } else {
        subs = await supaGet(`push_subscriptions?select=*`);
      }

      const payload = { title: alarm.title, body: alarm.body, url: alarm.url, tag: alarm.alarm_key };

      for (const sub of subs) {
        try {
          const r = await sendPush(sub.subscription_json, payload);
          if (r.status === 410 || r.status === 404) {
            await supaDelete(`push_subscriptions?id=eq.${sub.id}`);
          }
        } catch(e) { console.error('[push err]', e.message); }
      }
      console.log(`[cron] ${alarm.alarm_key} → ${subs.length} dispositivos`);
      processed++;
    }

    return res.status(200).json({ processed });
  } catch(e) {
    console.error('[cron-alarms]', e);
    return res.status(500).json({ error: e.message });
  }
}
