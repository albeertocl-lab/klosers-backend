// api/ingest-remoteok.js
//
// Remote OK tiene una API pública real, sin clave, sin registro:
// https://remoteok.com/api?tags=sales
//
// Nota de sus términos: si muestras estas ofertas en tu web, enlaza
// de vuelta a la URL original en Remote OK (ya lo hacemos vía
// url_origen) y no borres su nombre como fuente.

const { clasificarOferta } = require('../lib/clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../lib/guardarOferta');

const FUENTE = 'Remote OK';
const TAGS = (process.env.REMOTEOK_TAGS || 'sales').split(',');

async function buscarOfertasRemoteOk(tag) {
  const res = await fetch(`https://remoteok.com/api?tags=${encodeURIComponent(tag.trim())}`);
  if (!res.ok) throw new Error(`Remote OK API error (${res.status})`);
  const data = await res.json();
  // El primer elemento del array es metadata de la API, no una oferta real
  return data.filter((o) => o && o.id);
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const resultados = { procesadas: 0, errores: [] };

  for (const tag of TAGS) {
    try {
      const ofertas = await buscarOfertasRemoteOk(tag);
      for (const oferta of ofertas) {
        try {
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

  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return res.status(200).json(resultados);
}
