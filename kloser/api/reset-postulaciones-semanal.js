// api/reset-postulaciones-semanal.js
//
// Sustituye al "Scheduled Scenario" de Make del Módulo 3: resetea
// Postulaciones_Restantes según el plan de cada usuario. Vercel no
// ejecuta esto solo — hay que programarlo como Cron Job (ver
// vercel.json) para que se dispare, por ejemplo, cada lunes a las 00:00.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RESET_VALUE = {
  Rookie: 1,
  Pro: 5,
  Elite: 999999,
};

export default async function handler(req, res) {
  // Protegemos el endpoint para que solo Vercel Cron (o tú, a mano) pueda llamarlo
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const resultados = [];
  for (const [plan, valor] of Object.entries(RESET_VALUE)) {
    const { error, count } = await supabase
      .from('usuarios')
      .update({ postulaciones_restantes: valor }, { count: 'exact' })
      .eq('plan_stripe', plan);

    resultados.push({ plan, actualizados: count ?? 0, error: error?.message ?? null });
  }

  return res.status(200).json({ ok: true, resultados });
}
