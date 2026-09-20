// api/ingest-remotive.js
//
// Remotive tiene una API pública real, sin clave:
// https://remotive.com/api/remote-jobs?category=sales
//
// Términos de Remotive (importante respetarlos):
// - Máximo 4 peticiones al día (nuestro cron corre 1 vez al día, así que vamos sobrados).
// - Hay que enlazar de vuelta a la URL original en Remotive (ya lo hacemos vía url_origen)
//   y mencionar a Remotive como fuente.
// - No usar sus ofertas solo para captar registros/emails sin mostrar la oferta real.

const { clasificarOferta } = require('../lib/clasificarOferta');
const { upsertOfertaAutomatica, cerrarOfertasDesaparecidas } = require('../lib/guardarOferta');

const FUENTE = 'Remotive';
const CATEGORIA = process.env.REMOTIVE_CATEGORIA || 'sales';

async function buscarOfertasRemotive() {
  const res = await fetch(`https://remotive.com/api/remote-jobs?category=${encodeURIComponent(CATEGORIA)}`);
  if (!res.ok) throw new Error(`Remotive API error (${res.status})`);
  const data = await res.json();
  return data.jobs || [];
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const resultados = { procesadas: 0, errores: [] };

  try {
    const ofertas = await buscarOfertasRemotive();
    for (const oferta of ofertas) {
      try {
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

  const { cerradas } = await cerrarOfertasDesaparecidas(FUENTE);
  resultados.cerradas_por_desaparicion = cerradas;

  return res.status(200).json(resultados);
}
