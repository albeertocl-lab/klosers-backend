// lib/ingest/remotive.js
//
// Ingesta de ofertas desde Remotive. Ya NO es un endpoint HTTP propio:
// api/ingest-todas.js la importa y la ejecuta directamente en el mismo
// proceso, así no cuenta como una Serverless Function aparte.
//
// Remotive tiene una API pública real, sin clave:
// https://remotive.com/api/remote-jobs?category=sales
//
// Términos de Remotive (importante respetarlos):
// - Máximo 4 peticiones al día (nuestro cron corre 1 vez al día, así que vamos sobrados).
// - Hay que enlazar de vuelta a la URL original en Remotive (ya lo hacemos vía url_origen)
//   y mencionar a Remotive como fuente.
// - No usar sus ofertas solo para captar registros/emails sin mostrar la oferta real.

const { clasificarOferta } = require('../clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../guardarOferta');
const { SALTABLES, cargarExistentes, marcarVistas } = require('./comun');

const FUENTE = 'Remotive';
const CATEGORIA = process.env.REMOTIVE_CATEGORIA || 'sales';

async function buscarOfertasRemotive() {
  const res = await fetch(`https://remotive.com/api/remote-jobs?category=${encodeURIComponent(CATEGORIA)}`);
  if (!res.ok) throw new Error(`Remotive API error (${res.status})`);
  const data = await res.json();
  return data.jobs || [];
}

async function ingestarRemotive() {
  const resultados = { procesadas: 0, ya_existentes: 0, errores: [] };
  const existentes = await cargarExistentes(FUENTE);
  const vistas = [];

  try {
    const ofertas = await buscarOfertasRemotive();
    for (const oferta of ofertas) {
      try {
        const idExt = String(oferta.id);
        const previa = existentes.get(idExt);
        if (previa && SALTABLES.includes(previa.estado_oferta)) { vistas.push(previa.id); resultados.ya_existentes++; continue; }
        const textoBruto = `Título: ${oferta.title}\nEmpresa: ${oferta.company_name}\nUbicación: ${oferta.candidate_required_location || 'Remoto'}\nDescripción: ${oferta.description || ''}`;
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

  await marcarVistas(vistas);
  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return resultados;
}

module.exports = { ingestarRemotive };
