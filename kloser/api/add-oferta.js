// api/add-oferta.js
//
// Lo llama el panel de administración cuando pulsas "Guardar oferta".
// Inserta directamente en Supabase, marcada como fuente manual.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const c = req.body || {};
  if (!c.titulo || !c.fuente) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (título, fuente)' });
  }

  const { data, error } = await supabase.from('ofertas').insert({
    titulo_oferta: c.titulo,
    empresa_nombre: c.empresa || null,
    rol_requerido: c.rol || [],
    modalidad_oferta: c.modalidad || null,
    pais_oferta: c.pais || null,
    ciudad_provincia_oferta: c.ciudad_provincia || null,
    target_oferta: c.target || null,
    rango_ticket_oferta: c.rango_ticket || null,
    sector_oferta: c.sector || [],
    tipo_remuneracion: c.tipo_remuneracion || null,
    descripcion_completa: c.texto_original || null,
    url_origen: c.url_origen || null,
    fuente: c.fuente, // "LinkedIn (manual)" / "Indeed (manual)" / "Closer Skool (manual)" / "WhatsApp (manual)"
    fuente_tipo: 'manual',
    estado_oferta: 'Activa',
    fecha_publicacion: new Date().toISOString().slice(0, 10),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, oferta: data });
}
