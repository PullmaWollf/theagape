// api/schedule-alarm.js — Salva alarme de lanche no banco para o cron disparar
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { escala_id, alarm_ts, members, extra1d, extra3h, extra30m } = req.body;
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

  const ts = new Date(alarm_ts).getTime();
  const nomes = members.map(m => m.name.split(' ')[0]).join(', ');
  const userIds = members.map(m => m.id);

  const horarios = [
    { key: `${escala_id}-main`, ts,             label: '' },
    extra1d  && { key: `${escala_id}-1d`,  ts: ts-86400000, label: '[1 dia antes] ' },
    extra3h  && { key: `${escala_id}-3h`,  ts: ts-10800000, label: '[3h antes] ' },
    extra30m && { key: `${escala_id}-30m`, ts: ts-1800000,  label: '[30min antes] ' }
  ].filter(Boolean).filter(h => h.ts > Date.now());

  for (const h of horarios) {
    await fetch(`${SUPA_URL}/rest/v1/push_alarms`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        alarm_key:       h.key,
        fire_at:         new Date(h.ts).toISOString(),
        title:           '🧁 Lembrete de Lanche — Célula Ágape',
        body:            h.label + nomes + ' — não esqueça do lanche! 🧁',
        target_user_ids: userIds,
        url:             '/?page=escala',
        sent:            false
      })
    });
  }

  return res.status(200).json({ scheduled: horarios.length });
}
