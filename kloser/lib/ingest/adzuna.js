// lib/ingest/adzuna.js
//
// Ingesta de ofertas desde Adzuna. Ya NO es un endpoint HTTP propio:
// api/ingest-todas.js la importa y la ejecuta directamente en el mismo
// proceso, así no cuenta como una Serverless Function aparte.
// Requiere: ADZUNA_APP_ID, ADZUNA_APP_KEY
// (se obtienen en https://developer.adzuna.com/signup)

const { clasificarOferta } = require('../clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../guardarOferta');
const { SALTABLES, cargarExistentes, marcarVistas } = require('./comun');

const FUENTE = 'Adzuna';
const PAIS_ADZUNA = process.env.ADZUNA_PAIS || 'es'; // es, mx, etc. — ver países soportados en su documentación
const KEYWORDS = (process.env.INGESTA_KEYWORDS || 'comercial,ventas,closer,SDR,account manager,key account').split(',');

async function buscarOfertasAdzuna(query) {
  const url = `https://api.adzuna.com/v1/api/jobs/${PAIS_ADZUNA}/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&results_per_page=25&what=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Adzuna API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.results || [];
}

async function ingestarAdzuna() {
  const resultados = { procesadas: 0, ya_existentes: 0, errores: [] };
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) return { procesadas: 0, errores: [], omitida: 'sin credenciales (ADZUNA_APP_ID y ADZUNA_APP_KEY)' };
  const existentes = await cargarExistentes(FUENTE);
  const vistas = [];

  for (const kw of KEYWORDS) {
    try {
      const ofertas = await buscarOfertasAdzuna(kw.trim());
      for (const oferta of ofertas) {
        try {
          const idExt = String(oferta.id);
          const previa = existentes.get(idExt);
          if (previa && SALTABLES.includes(previa.estado_oferta)) { vistas.push(previa.id); resultados.ya_existentes++; continue; }
          const textoBruto = `Título: ${oferta.title}\nEmpresa: ${oferta.company?.display_name || 'No especificado'}\nUbicación: ${oferta.location?.display_name || ''}\nDescripción: ${oferta.description || ''}`;
          const clasificada = await clasificarOferta(textoBruto);
          await upsertOfertaAutomatica({
            clasificada,
            fuente: FUENTE,
            idExterno: String(oferta.id),
            urlOrigen: oferta.redirect_url,
          });
          resultados.procesadas++;
        } catch (err) {
          resultados.errores.push({ oferta: oferta.id, error: err.message });
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

module.exports = { ingestarAdzuna };
