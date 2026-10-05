// lib/ingest/jooble.js
//
// Ingesta de ofertas desde Jooble. Ya NO es un endpoint HTTP propio:
// api/ingest-todas.js la importa y la ejecuta directamente en el mismo
// proceso, así no cuenta como una Serverless Function aparte.
//
// Requiere: JOOBLE_API_KEY
// (se obtiene registrándote en https://jooble.org/api/about)

const { clasificarOferta } = require('../clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../guardarOferta');
const { SALTABLES, cargarExistentes, marcarVistas } = require('./comun');

const FUENTE = 'Jooble';
const KEYWORDS = (process.env.INGESTA_KEYWORDS || 'comercial,ventas,closer,SDR,account manager,key account').split(',');

async function buscarOfertasJooble(query) {
  const res = await fetch(`https://jooble.org/api/${process.env.JOOBLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: query, location: 'España' }),
  });
  if (!res.ok) throw new Error(`Jooble API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.jobs || [];
}

async function ingestarJooble() {
  const resultados = { procesadas: 0, ya_existentes: 0, errores: [] };
  if (!process.env.JOOBLE_API_KEY) return { procesadas: 0, errores: [], omitida: 'sin clave (JOOBLE_API_KEY)' };
  const existentes = await cargarExistentes(FUENTE);
  const vistas = [];

  for (const kw of KEYWORDS) {
    try {
      const ofertas = await buscarOfertasJooble(kw.trim());
      for (const oferta of ofertas) {
        try {
          const idExt = String(oferta.link);
          const previa = existentes.get(idExt);
          if (previa && SALTABLES.includes(previa.estado_oferta)) { vistas.push(previa.id); resultados.ya_existentes++; continue; }
          const textoBruto = `Título: ${oferta.title}\nEmpresa: ${oferta.company || 'No especificado'}\nUbicación: ${oferta.location || ''}\nDescripción: ${oferta.snippet || ''}`;
          const clasificada = await clasificarOferta(textoBruto);
          // Jooble no siempre da un id estable — usamos la URL como id externo
          await upsertOfertaAutomatica({
            clasificada,
            fuente: FUENTE,
            idExterno: oferta.link,
            urlOrigen: oferta.link,
          });
          resultados.procesadas++;
        } catch (err) {
          resultados.errores.push({ oferta: oferta.link, error: err.message });
        }
      }
    } catch (err) {
      resultados.errores.push({ keyword: kw, error: err.message });
    }
  }

  await marcarVistas(vistas);
  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return resultados;
}

module.exports = { ingestarJooble };
