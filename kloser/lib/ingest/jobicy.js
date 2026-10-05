// lib/ingest/jobicy.js
//
// Ingesta de ofertas desde Jobicy. Ya NO es un endpoint HTTP propio:
// api/ingest-todas.js la importa y la ejecuta directamente en el mismo
// proceso, así no cuenta como una Serverless Function aparte.
//
// Jobicy tiene una API pública real, sin clave:
// https://jobicy.com/api/v2/remote-jobs?count=50&tag=sales   (máximo 50 por petición cuando hay filtros)

const { clasificarOferta } = require('../clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../guardarOferta');
const { SALTABLES, cargarExistentes, marcarVistas, registroJornadas } = require('./comun');

const FUENTE = 'Jobicy';
const TAG = process.env.JOBICY_TAG || 'sales';   // palabra clave (parámetro `tag` de su API)

async function buscarOfertasJobicy() {
  const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(TAG)}`);
  if (!res.ok) throw new Error(`Jobicy API error (${res.status})`);
  const data = await res.json();
  return data.jobs || [];
}

async function ingestarJobicy() {
  const resultados = { procesadas: 0, ya_existentes: 0, errores: [] };
  const existentes = await cargarExistentes(FUENTE);
  const vistas = [];
  const jornadas = registroJornadas(FUENTE);

  try {
    const ofertas = await buscarOfertasJobicy();
    for (const oferta of ofertas) {
      try {
        const idExt = String(oferta.id);
        const previa = existentes.get(idExt);
        if (previa && SALTABLES.includes(previa.estado_oferta)) { vistas.push(previa.id); jornadas.existente(previa, oferta); resultados.ya_existentes++; continue; }
        const textoBruto = `Título: ${oferta.jobTitle}\nEmpresa: ${oferta.companyName}\nUbicación: ${oferta.jobGeo || 'Remoto'}\nDescripción: ${oferta.jobExcerpt || oferta.jobDescription || ''}`;
        const clasificada = await clasificarOferta(textoBruto);
        await upsertOfertaAutomatica({
          clasificada,
          fuente: FUENTE,
          idExterno: String(oferta.id),
          urlOrigen: oferta.url,
        });
        resultados.procesadas++;
        jornadas.nueva(idExt, oferta);
      } catch (err) {
        resultados.errores.push({ oferta: oferta.id, error: err.message });
      }
    }
  } catch (err) {
    resultados.errores.push({ general: err.message });
  }

  await marcarVistas(vistas);
  await jornadas.aplicar();
  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return resultados;
}

module.exports = { ingestarJobicy };
