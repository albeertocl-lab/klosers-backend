// lib/ingest/jobicy.js
//
// Ingesta de ofertas desde Jobicy. Ya NO es un endpoint HTTP propio:
// api/ingest-todas.js la importa y la ejecuta directamente en el mismo
// proceso, así no cuenta como una Serverless Function aparte.
//
// Jobicy tiene una API pública real, sin clave:
// https://jobicy.com/api/v2/remote-jobs?industry=sales

const { clasificarOferta } = require('../clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../guardarOferta');

const FUENTE = 'Jobicy';
const INDUSTRIA = process.env.JOBICY_INDUSTRIA || 'sales';

async function buscarOfertasJobicy() {
  const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=100&industry=${encodeURIComponent(INDUSTRIA)}`);
  if (!res.ok) throw new Error(`Jobicy API error (${res.status})`);
  const data = await res.json();
  return data.jobs || [];
}

async function ingestarJobicy() {
  const resultados = { procesadas: 0, errores: [] };

  try {
    const ofertas = await buscarOfertasJobicy();
    for (const oferta of ofertas) {
      try {
        const textoBruto = `Título: ${oferta.jobTitle}\nEmpresa: ${oferta.companyName}\nUbicación: ${oferta.jobGeo || 'Remoto'}\nDescripción: ${oferta.jobExcerpt || oferta.jobDescription || ''}`;
        const clasificada = await clasificarOferta(textoBruto);
        await upsertOfertaAutomatica({
          clasificada,
          fuente: FUENTE,
          idExterno: String(oferta.id),
          urlOrigen: oferta.url,
        });
        resultados.procesadas++;
      } catch (err) {
        resultados.errores.push({ oferta: oferta.id, error: err.message });
      }
    }
  } catch (err) {
    resultados.errores.push({ general: err.message });
  }

  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return resultados;
}

module.exports = { ingestarJobicy };
