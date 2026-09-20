// api/ingest-todas.js
//
// Un único cron diario que dispara las 3 ingestas (InfoJobs,
// Adzuna, Jooble). Consolidado en una sola función por si tu
// plan de Vercel limita el número de Cron Jobs — así solo
// necesitas 1 cron diario + 2 semanales (reset y alerta), en
// vez de 5 crons separados.

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const base = process.env.APP_URL;
  const headers = { Authorization: `Bearer ${process.env.CRON_SECRET}` };

  const [infojobs, adzuna, jooble, remoteok, remotive, jobicy, himalayas] = await Promise.allSettled([
    fetch(`${base}/api/ingest-infojobs`, { headers }).then((r) => r.json()),
    fetch(`${base}/api/ingest-adzuna`, { headers }).then((r) => r.json()),
    fetch(`${base}/api/ingest-jooble`, { headers }).then((r) => r.json()),
    fetch(`${base}/api/ingest-remoteok`, { headers }).then((r) => r.json()),
    fetch(`${base}/api/ingest-remotive`, { headers }).then((r) => r.json()),
    fetch(`${base}/api/ingest-jobicy`, { headers }).then((r) => r.json()),
    fetch(`${base}/api/ingest-himalayas`, { headers }).then((r) => r.json()),
  ]);

  return res.status(200).json({ infojobs, adzuna, jooble, remoteok, remotive, jobicy, himalayas });
}
