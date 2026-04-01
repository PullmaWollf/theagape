// api/cron-alarms.js — Cron job que roda a cada minuto
// Vercel: configure em vercel.json como "crons"
// Busca alarmes pendentes e envia push

export default async function handler(req, res) {
  // Segurança: só aceita chamada do Vercel Cron
  const authHeader = req.headers.authorization;
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  const BASE_URL = process.env.VERCEL_URL
    ? 'https://' + process.env.VERCEL_URL
    : process.env.APP_URL || 'http://localhost:3000';

  // Busca alarmes que devem disparar agora (até 2 minutos de tolerância)
  const agora = new Date().toISOString();
  const limite = new Date(Date.now() - 120000).toISOString(); // 2min atrás

  const r = await fetch(
    SUPA_URL + '/rest/v1/push_alarms?sent=eq.false&fire_at=lte.' + agora + '&fire_at=gte.' + limite,
    { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } }
  );
  const alarms = await r.json();

  if (!Array.isArray(alarms) || !alarms.length) {
    return res.status(200).json({ processed: 0 });
  }

  let processed = 0;
  for (const alarm of alarms) {
    // Marca como enviado primeiro (evita duplicata)
    await fetch(SUPA_URL + '/rest/v1/push_alarms?id=eq.' + alarm.id, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sent: true })
    });

    // Para cada usuário alvo, envia push
    const userIds = alarm.target_user_ids || [];
    for (const userId of userIds) {
      await fetch(BASE_URL + '/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'targeted',
          target_user_id: userId,
          payload: {
            title: alarm.title,
            body:  alarm.body,
            url:   alarm.url || '/?page=escala'
          }
        })
      });
    }
    processed++;
  }

  return res.status(200).json({ processed });
}
