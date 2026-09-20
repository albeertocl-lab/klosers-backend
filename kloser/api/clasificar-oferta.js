// api/clasificar-oferta.js
//
// Lo llama el panel de administración cuando pulsas "Extraer con IA".
// Recibe el texto pegado (de LinkedIn, Indeed, Closer Skool, WhatsApp...)
// y devuelve los campos ya estructurados para que los revises antes
// de guardar. La clave de Anthropic vive aquí, en el backend — nunca
// se expone al navegador.

const { clasificarOferta } = require('../lib/clasificarOferta');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const { texto } = req.body || {};
  if (!texto || texto.trim().length < 20) {
    return res.status(400).json({ error: 'Pega el texto completo de la oferta' });
  }

  try {
    const clasificada = await clasificarOferta(texto);
    return res.status(200).json(clasificada);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
