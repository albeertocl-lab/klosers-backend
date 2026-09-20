// api/ingest-infojobs.js
//
// Cron diario (ver vercel.json): busca ofertas comerciales en
// InfoJobs, las clasifica con IA a nuestro formato, y cierra
// automáticamente las que ya no aparecen — así nadie sigue
// postulando a un proceso que la empresa ya cerró.
//
// Requiere: INFOJOBS_CLIENT_ID, INFOJOBS_CLIENT_SECRET
// (se obtienen registrándote en https://developer.infojobs.net/)

const { clasificarOferta } = require('../lib/clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../lib/guardarOferta');

const FUENTE = 'InfoJobs';

// Ajusta estas palabras clave a tu criterio sin tocar el código
const KEYWORDS = (process.env.INGESTA_KEYWORDS || 'comercial,ventas,closer,SDR,account manager,key account').split(',');

async function buscarOfertasInfoJobs(query) {
  const auth = Buffer.from(`${process.env.INFOJOBS_CLIENT_ID}:${process.env.INFOJOBS_CLIENT_SECRET}`).toString('base64');
  const url = `https://api.infojobs.net/api/9/offer?q=${encodeURIComponent(query)}&maxResults=25&order=updated-desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`InfoJobs API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.offers || [];
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const resultados = { procesadas: 0, errores: [] };

  for (const kw of KEYWORDS) {
    try {
      const ofertas = await buscarOfertasInfoJobs(kw.trim());
      for (const oferta of ofertas) {
        try {
          const textoBruto = `Título: ${oferta.title}\nEmpresa: ${oferta.author?.name || 'No especificado'}\nUbicación: ${oferta.city}, ${oferta.province?.value}\nDescripción: ${oferta.requirementMin || ''} ${oferta.description || ''}`;
          const clasificada = await clasificarOferta(textoBruto);
          await upsertOfertaAutomatica({
            clasificada,
            fuente: FUENTE,
            idExterno: oferta.id,
            urlOrigen: oferta.link,
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

  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return res.status(200).json(resultados);
}
