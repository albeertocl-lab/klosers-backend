// api/ingest-jooble.js
//
// Igual que las otras dos ingestas pero para Jooble.
// Requiere: JOOBLE_API_KEY
// (se obtiene registrándote en https://jooble.org/api/about)

const { clasificarOferta } = require('../lib/clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../lib/guardarOferta');

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

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const resultados = { procesadas: 0, errores: [] };

  for (const kw of KEYWORDS) {
    try {
      const ofertas = await buscarOfertasJooble(kw.trim());
      for (const oferta of ofertas) {
        try {
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

  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return res.status(200).json(resultados);
}
