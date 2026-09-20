// api/admin-datos.js
//
// Lo llama la pestaña "Registros y postulaciones" del panel /admin.
// Devuelve la lista de usuarios registrados y de postulaciones
// (matches), con los nombres ya cruzados para no tener que hacerlo
// en el navegador.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const { data: usuarios, error: errUsuarios } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, email, plan_stripe, estado_verificacion, insignia_verificado, postulaciones_restantes, created_at')
    .order('created_at', { ascending: false });

  if (errUsuarios) return res.status(500).json({ error: errUsuarios.message });

  const { data: postulaciones, error: errMatches } = await supabase
    .from('matches')
    .select('id, porcentaje_compatibilidad, postulado, created_at, usuarios(nombre_completo, email), ofertas(titulo_oferta, empresa_id)')
    .eq('postulado', true)
    .order('created_at', { ascending: false });

  if (errMatches) return res.status(500).json({ error: errMatches.message });

  const { data: ofertas, error: errOfertas } = await supabase
    .from('ofertas')
    .select('*')
    .order('created_at', { ascending: false });

  if (errOfertas) return res.status(500).json({ error: errOfertas.message });

  return res.status(200).json({ usuarios, postulaciones, ofertas });
}
