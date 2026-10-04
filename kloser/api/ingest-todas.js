// api/ingest-todas.js
//
// Único cron diario que ejecuta las 7 ingestas EN EL MISMO PROCESO (sin llamadas HTTP internas).
// Cada ejecución queda anotada en la tabla ingesta_log, que se ve en la pestaña "Ingesta" del panel:
//   - una fila con "inicio" y sin "fin" significa que la función se cortó antes de terminar (límite de tiempo)
//   - por fuente: ofertas procesadas, errores (con una muestra del mensaje) y ofertas cerradas
//
// Requiere: CRON_SECRET (y las claves de cada fuente), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { sbInsert, sbUpdate } = require('../lib/sesion');
const { ingestarInfojobs } = require('../lib/ingest/infojobs');
const { ingestarAdzuna } = require('../lib/ingest/adzuna');
const { ingestarJooble } = require('../lib/ingest/jooble');
const { ingestarRemoteok } = require('../lib/ingest/remoteok');
const { ingestarRemotive } = require('../lib/ingest/remotive');
const { ingestarJobicy } = require('../lib/ingest/jobicy');
const { ingestarHimalayas } = require('../lib/ingest/himalayas');

const FUENTES = [
  ['InfoJobs', ingestarInfojobs],
  ['Adzuna', ingestarAdzuna],
  ['Jooble', ingestarJooble],
  ['Remote OK', ingestarRemoteok],
  ['Remotive', ingestarRemotive],
  ['Jobicy', ingestarJobicy],
  ['Himalayas', ingestarHimalayas],
];

function mensaje(e) {
  if (e && typeof e === 'object') return String(e.error || e.general || e.message || JSON.stringify(e)).slice(0, 300);
  return String(e).slice(0, 300);
}

function contar(v) {
  if (Array.isArray(v)) return v.length;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  // Si falla el registro, la ingesta sigue igual
  let logId = null;
  try {
    const [fila] = await sbInsert('ingesta_log', {});
    logId = fila && fila.id;
  } catch (e) {
    console.error('ingesta_log (inicio):', e.message);
  }

  const resultados = await Promise.allSettled(FUENTES.map(([, ingestar]) => ingestar()));

  const resumen = {};
  FUENTES.forEach(([nombre], i) => {
    const r = resultados[i];
    if (r.status === 'fulfilled') {
      const v = r.value || {};
      const errores = Array.isArray(v.errores) ? v.errores : [];
      const procesadas = Number(v.procesadas) || 0;
      resumen[nombre] = {
        estado: errores.length && !procesadas ? 'error' : errores.length ? 'parcial' : 'ok',
        procesadas,
        errores: errores.length,
        cerradas: contar(v.cerradas_por_desaparicion),
        muestra_errores: errores.slice(0, 3).map(mensaje),
      };
    } else {
      resumen[nombre] = { estado: 'error', procesadas: 0, errores: 1, cerradas: 0, muestra_errores: [mensaje(r.reason)] };
    }
  });

  if (logId) {
    try {
      await sbUpdate('ingesta_log', `id=eq.${logId}`, { fin: new Date().toISOString(), resultados: resumen });
    } catch (e) {
      console.error('ingesta_log (fin):', e.message);
    }
  }

  return res.status(200).json(resumen);
};
