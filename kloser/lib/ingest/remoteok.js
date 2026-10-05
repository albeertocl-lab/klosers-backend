// lib/ingest/remoteok.js
//
// Ingesta de ofertas desde Remote OK. Ya NO es un endpoint HTTP propio:
// api/ingest-todas.js la importa y la ejecuta directamente en el mismo
// proceso, así no cuenta como una Serverless Function aparte.
//
// Remote OK tiene una API pública real, sin clave, sin registro:
// https://remoteok.com/api?tags=sales
//
// Nota de sus términos: si muestras estas ofertas en tu web, enlaza
// de vuelta a la URL original en Remote OK (ya lo hacemos vía
// url_origen) y no borres su nombre como fuente.

const { clasificarOferta } = require('../clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../guardarOferta');
const { SALTABLES, cargarExistentes, marcarVistas } = require('./comun');

const FUENTE = 'Remote OK';
const TAGS = (process.env.REMOTEOK_TAGS || 'sales').split(',');

async function buscarOfertasRemoteOk(tag) {
  const res = await fetch(`https://remoteok.com/api?tags=${encodeURIComponent(tag.trim())}`);
  if (!res.ok) throw new Error(`Remote OK API error (${res.status})`);
  const data = await res.json();
  // El primer elemento del array es metadata de la API, no una oferta real
  return data.filter((o) => o && o.id);
}

async function ingestarRemoteok() {
  const resultados = { procesadas: 0, ya_existentes: 0, errores: [] };
  const existentes = await cargarExistentes(FUENTE);
  const vistas = [];

  for (const tag of TAGS) {
    try {
      const ofertas = await buscarOfertasRemoteOk(tag);
      for (const oferta of ofertas) {
        try {
          const idExt = String(oferta.id);
          const previa = existentes.get(idExt);
          if (previa && SALTABLES.includes(previa.estado_oferta)) { vistas.push(previa.id); resultados.ya_existentes++; continue; }
          const textoBruto = `Título: ${oferta.position}\nEmpresa: ${oferta.company}\nUbicación: ${oferta.location || 'Remoto'}\nDescripción: ${oferta.description || ''}`;
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
      resultados.errores.push({ tag, error: err.message });
    }
  }

  await marcarVistas(vistas);
  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return resultados;
}

module.exports = { ingestarRemoteok };
