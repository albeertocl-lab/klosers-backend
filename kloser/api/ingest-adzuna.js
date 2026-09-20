// api/ingest-adzuna.js
//
// Igual que ingest-infojobs.js pero para Adzuna.
// Requiere: ADZUNA_APP_ID, ADZUNA_APP_KEY
// (se obtienen en https://developer.adzuna.com/signup)

const { clasificarOferta } = require('../lib/clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../lib/guardarOferta');

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

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const resultados = { procesadas: 0, errores: [] };

  for (const kw of KEYWORDS) {
    try {
      const ofertas = await buscarOfertasAdzuna(kw.trim());
      for (const oferta of ofertas) {
        try {
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

  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return res.status(200).json(resultados);
}
