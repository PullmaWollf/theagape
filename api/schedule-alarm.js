// api/schedule-alarm.js — Salva alarmes de lanche diários (segunda até o dia da célula) às 12:00 BRT
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { escala_id, alarm_ts, members } = req.body;
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!escala_id || !alarm_ts || !members) {
    return res.status(400).json({ error: 'Missing data' });
  }

  try {
    // O dia da célula é definido em alarm_ts (YYYY-MM-DD)
    const cellDate = new Date(alarm_ts + 'T12:00:00-03:00');
    const cellDayOfWeek = cellDate.getDay(); // 0=Dom, 1=Seg...

    // Segunda-feira da mesma semana da célula
    const diffToMonday = cellDayOfWeek === 0 ? -6 : 1 - cellDayOfWeek;
    const monday = new Date(cellDate);
    monday.setDate(cellDate.getDate() + diffToMonday);

    const userIds = members.map(m => m.id);
    const notifications = [];

    for (let d = new Date(monday); d <= cellDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const fireAt = `${dateStr}T12:00:00-03:00`;
      
      // Apenas agendar se for no futuro
      if (new Date(fireAt).getTime() > Date.now()) {
        notifications.push({
          alarm_key: `escala_${escala_id}_${dateStr}`,
          fire_at: fireAt,
          title: "Bom dia!!! Você está escalado para o lanche da semana, organize-se!",
          body: "🧁 Lembrete de Lanche — Célula Ágape",
          target_user_ids: userIds,
          url: "/?page=escala",
          sent: false
        });
      }
    }

    if (notifications.length > 0) {
      await fetch(`${SUPA_URL}/rest/v1/push_alarms`, {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify(notifications)
      });
    }

    return res.status(200).json({ scheduled: notifications.length });
  } catch (error) {
    console.error('Error scheduling alarms:', error);
    return res.status(500).json({ error: error.message });
  }
}
