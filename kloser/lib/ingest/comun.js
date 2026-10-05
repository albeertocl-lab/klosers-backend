// lib/ingest/comun.js
//
// Utilidades compartidas por las ingestas. Evitan volver a clasificar con IA ofertas que ya están en la base de datos:
// cada día solo se clasifican las ofertas NUEVAS; las que ya existen solo se marcan como «vistas hoy» para que no se cierren.
// (La clasificación con IA es lo que tardaba casi 4 minutos y gastaba crédito cada día.)

const { sbSelect, sbUpdate } = require('../sesion');

// Estados en los que una oferta existente se deja tal cual. Una oferta «Cerrada» que reaparece sigue el camino normal (se reactiva).
const SALTABLES = ['Activa', 'Pausada', 'Revisión Manual'];

// Jornada / tipo de contrato que declara cada fuente en sus propios campos (sin IA). Si la fuente no lo indica, queda sin definir.
function normalizarJornada(texto) {
  const t = String(texto || '').toLowerCase();
  if (!t) return null;
  if (/intern|pr[aá]ctic|becari|trainee/.test(t)) return 'Prácticas';
  if (/freelanc|contractor|aut[oó]nom|self[- ]?employed|contract/.test(t)) return 'Autónomo / Freelance';
  if (/part[ _-]?time|media jornada|jornada parcial/.test(t)) return 'Jornada parcial';
  if (/full[ _-]?time|jornada completa|tiempo completo/.test(t)) return 'Jornada completa';
  return null;
}

const EXTRACTORES = {
  'Remotive': (o) => normalizarJornada(o.job_type),
  'Jobicy': (o) => normalizarJornada([].concat(o.jobType || []).join(' ')),
  'Himalayas': (o) => normalizarJornada(o.employmentType),
  // En Adzuna solo se usa contract_time: contract_type «contract» no distingue autónomo de contrato temporal
  'Adzuna': (o) => normalizarJornada(o.contract_time),
  'Jooble': (o) => normalizarJornada(o.type),
  'Remote OK': (o) => normalizarJornada([].concat(o.tags || []).join(' ')),
};

function jornadaDe(fuente, oferta) {
  try { return (EXTRACTORES[fuente] || (() => null))(oferta); } catch (_) { return null; }
}

// Acumula las jornadas detectadas y las guarda al final con muy pocas peticiones (una por tipo de jornada).
// Las ofertas que ya tienen jornada (por ejemplo, puesta por ti en el panel) no se tocan.
function registroJornadas(fuente) {
  const porId = new Map();        // id de la fila -> jornada
  const porIdExterno = new Map(); // id externo (ofertas nuevas) -> jornada
  return {
    existente(previa, oferta) {
      if (previa.tipo_contrato) return;
      const j = jornadaDe(fuente, oferta);
      if (j) porId.set(previa.id, j);
    },
    nueva(idExterno, oferta) {
      const j = jornadaDe(fuente, oferta);
      if (j) porIdExterno.set(String(idExterno), j);
    },
    async aplicar() {
      const grupos = (mapa) => { const g = {}; for (const [k, j] of mapa) (g[j] = g[j] || []).push(k); return g; };
      try {
        for (const [j, ids] of Object.entries(grupos(porId))) {
          for (let i = 0; i < ids.length; i += 80) {
            await sbUpdate('ofertas', `id=in.(${ids.slice(i, i + 80).join(',')})&tipo_contrato=is.null`, { tipo_contrato: j });
          }
        }
        for (const [j, ids] of Object.entries(grupos(porIdExterno))) {
          for (let i = 0; i < ids.length; i += 60) {
            const lista = ids.slice(i, i + 60).map((x) => `"${x.replace(/"/g, '')}"`).join(',');
            await sbUpdate('ofertas', `fuente=eq.${encodeURIComponent(fuente)}&id_externo=in.(${encodeURIComponent(lista)})&tipo_contrato=is.null`, { tipo_contrato: j });
          }
        }
      } catch (e) {
        console.error('jornadas:', e.message);   // nunca debe romper la ingesta
      }
    },
  };
}

async function cargarExistentes(fuente) {
  const mapa = new Map();
  try {
    for (let desde = 0; ; desde += 1000) {
      const filas = await sbSelect('ofertas',
        `fuente=eq.${encodeURIComponent(fuente)}&select=id,id_externo,estado_oferta,tipo_contrato&order=id&limit=1000&offset=${desde}`);
      filas.forEach((f) => { if (f.id_externo != null) mapa.set(String(f.id_externo), f); });
      if (filas.length < 1000) break;
    }
  } catch (e) {
    console.error('cargarExistentes:', e.message);
    mapa.clear();   // si falla, todo se procesa como antes: más lento, pero nunca se pierde nada
  }
  return mapa;
}

async function marcarVistas(ids) {
  const ahora = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 80) {
    try {
      await sbUpdate('ofertas', `id=in.(${ids.slice(i, i + 80).join(',')})`, { ultima_vista_en_origen: ahora });
    } catch (e) {
      console.error('marcarVistas:', e.message);
    }
  }
}

module.exports = { SALTABLES, cargarExistentes, marcarVistas, registroJornadas, jornadaDe, normalizarJornada };
