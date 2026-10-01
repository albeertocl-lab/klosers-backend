// lib/ingest/himalayas.js
//
// Ingesta de ofertas desde Himalayas. Ya NO es un endpoint HTTP propio:
// api/ingest-todas.js la importa y la ejecuta directamente en el mismo
// proceso, así no cuenta como una Serverless Function aparte.
//
// Himalayas tiene una API pública real, sin clave:
// https://himalayas.app/jobs/api/search?keywords=sales
//
// Términos de Himalayas: enlazar de vuelta a la URL original del
// puesto (ya lo hacemos vía url_origen) y mencionar a Himalayas
// como fuente.

const { clasificarOferta } = require('../clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../guardarOferta');

const FUENTE = 'Himalayas';
const KEYWORDS = process.env.HIMALAYAS_KEYWORDS || 'sales';

async function buscarOfertasHimalayas() {
  const res = await fetch(`https://himalayas.app/jobs/api/search?keywords=${encodeURIComponent(KEYWORDS)}&limit=100`);
  if (!res.ok) throw new Error(`Himalayas API error (${res.status})`);
  const data = await res.json();
  return data.jobs || [];
}

async function ingestarHimalayas() {
  const resultados = { procesadas: 0, errores: [] };

  try {
    const ofertas = await buscarOfertasHimalayas();
    for (const oferta of ofertas) {
      try {
        const textoBruto = `Título: ${oferta.title}\nEmpresa: ${oferta.companyName}\nUbicación: ${(oferta.locationRestrictions || []).join(', ') || 'Remoto'}\nDescripción: ${oferta.description || ''}`;
        const clasificada = await clasificarOferta(textoBruto);
        await upsertOfertaAutomatica({
          clasificada,
          fuente: FUENTE,
          idExterno: String(oferta.id),
          urlOrigen: oferta.applicationLink || oferta.guid,
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

module.exports = { ingestarHimalayas };
