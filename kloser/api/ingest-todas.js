// api/ingest-todas.js
//
// Único cron diario que ejecuta las 7 ingestas EN EL MISMO PROCESO
// (ya no vía HTTP interno a sí mismo). Esto evita que cada ingest-*.js
// cuente como una Serverless Function aparte, y de paso es más rápido
// al ahorrarse 7 saltos HTTP internos.
//
// IMPORTANTE: esto asume que ya has movido cada api/ingest-<fuente>.js
// a lib/ingest/<fuente>.js siguiendo el mismo patrón que adzuna.js
// (quitar el wrapper de handler/auth, exportar la función con
// module.exports, devolver "resultados" en vez de res.status(200).json(...)).

const { ingestarInfojobs } = require('../lib/ingest/infojobs');
const { ingestarAdzuna } = require('../lib/ingest/adzuna');
const { ingestarJooble } = require('../lib/ingest/jooble');
const { ingestarRemoteok } = require('../lib/ingest/remoteok');
const { ingestarRemotive } = require('../lib/ingest/remotive');
const { ingestarJobicy } = require('../lib/ingest/jobicy');
const { ingestarHimalayas } = require('../lib/ingest/himalayas');

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const [infojobs, adzuna, jooble, remoteok, remotive, jobicy, himalayas] = await Promise.allSettled([
    ingestarInfojobs(),
    ingestarAdzuna(),
    ingestarJooble(),
    ingestarRemoteok(),
    ingestarRemotive(),
    ingestarJobicy(),
    ingestarHimalayas(),
  ]);

  return res.status(200).json({ infojobs, adzuna, jooble, remoteok, remotive, jobicy, himalayas });
}
