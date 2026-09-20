// api/admin-actualizar-oferta.js
//
// Lo llama la pestaña "Gestionar ofertas" del panel /admin para
// pausar, reactivar, cerrar, eliminar o destacar una oferta.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const { id, accion } = req.body || {};
  if (!id || !accion) {
    return res.status(400).json({ error: 'Faltan id o accion' });
  }

  try {
    if (accion === 'eliminar') {
      const { error } = await supabase.from('ofertas').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (accion === 'pausar' || accion === 'activar' || accion === 'cerrar') {
      const estado = { pausar: 'Pausada', activar: 'Activa', cerrar: 'Cerrada' }[accion];
      const { error } = await supabase.from('ofertas').update({ estado_oferta: estado }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true, estado_oferta: estado });
    }

    if (accion === 'destacar') {
      // Sube esta oferta por encima de todas las demás destacadas
      const { data: maxRow } = await supabase
        .from('ofertas')
        .select('orden_destacado')
        .order('orden_destacado', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nuevoOrden = (maxRow?.orden_destacado ?? 0) + 1;
      const { error } = await supabase
        .from('ofertas')
        .update({ destacado: true, orden_destacado: nuevoOrden })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true, orden_destacado: nuevoOrden });
    }

    if (accion === 'quitar_destacado') {
      const { error } = await supabase.from('ofertas').update({ destacado: false }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
