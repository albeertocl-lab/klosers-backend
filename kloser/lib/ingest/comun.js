// lib/ingest/comun.js
//
// Utilidades compartidas por las ingestas. Evitan volver a clasificar con IA ofertas que ya están en la base de datos:
// cada día solo se clasifican las ofertas NUEVAS; las que ya existen solo se marcan como «vistas hoy» para que no se cierren.
// (La clasificación con IA es lo que tardaba casi 4 minutos y gastaba crédito cada día.)

const { sbSelect, sbUpdate } = require('../sesion');

// Estados en los que una oferta existente se deja tal cual. Una oferta «Cerrada» que reaparece sigue el camino normal (se reactiva).
const SALTABLES = ['Activa', 'Pausada', 'Revisión Manual'];

async function cargarExistentes(fuente) {
  const mapa = new Map();
  try {
    for (let desde = 0; ; desde += 1000) {
      const filas = await sbSelect('ofertas',
        `fuente=eq.${encodeURIComponent(fuente)}&select=id,id_externo,estado_oferta&order=id&limit=1000&offset=${desde}`);
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

module.exports = { SALTABLES, cargarExistentes, marcarVistas };
