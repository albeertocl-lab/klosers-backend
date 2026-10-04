// api/admin-actualizar-oferta.js
//
// Todas las acciones de escritura del panel de administración (se mantiene el nombre del archivo
// para no gastar otra de las 12 funciones que permite el plan gratuito de Vercel).
//
// Ofertas  { accion, id }                        pausar | activar | cerrar | destacar | quitar_destacado | eliminar
//          { accion:'editar', id, datos:{...} }  edita los campos de la oferta
//          { accion, ids:[...] }                 pausar | activar | cerrar | eliminar sobre varias a la vez
// Usuarios { entidad:'usuario', accion, id }     verificar | quitar_verificacion | rechazar_pitch |
//                                               reset_postulaciones | eliminar
//          { entidad:'usuario', accion:'set_plan', id, plan }
//
// Cada acción queda anotada en admin_log. Se llama con la cabecera x-admin-password.
// Requiere: ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (y STRIPE_SECRET_KEY para borrar usuarios)

const { sbSelect, sbUpdate, sbDelete, sbRpc, leerJson } = require('../lib/sesion');
const { stripe } = require('../lib/stripe');
const { autorizar, registrar, validarEdicionOferta, LIMITES_PLAN, UUID } = require('../lib/admin');

const ESTADOS_SUSCRIPCION_VIVA = ['active', 'trialing', 'past_due'];

function accionesSimplesOferta() {
  return {
    pausar: () => ({ estado_oferta: 'Pausada' }),
    // Al reactivar se marca como vista hoy para que la ingesta no la cierre por "desaparecida"
    activar: () => ({ estado_oferta: 'Activa', ultima_vista_en_origen: new Date().toISOString() }),
    cerrar: () => ({ estado_oferta: 'Cerrada' }),
    destacar: () => ({ destacado: true, orden_destacado: Math.floor(Date.now() / 1000) }),
    quitar_destacado: () => ({ destacado: false, orden_destacado: 0 }),
  };
}

async function accionOferta(b, res) {
  const simples = accionesSimplesOferta();

  // ---- Varias ofertas a la vez ----
  if (Array.isArray(b.ids)) {
    if (!['pausar', 'activar', 'cerrar', 'eliminar'].includes(b.accion)) {
      return res.status(400).json({ error: 'Esa acción no se puede aplicar a varias ofertas.' });
    }
    const ids = [...new Set(b.ids)];
    if (!ids.length || ids.length > 200 || !ids.every((i) => UUID.test(i))) {
      return res.status(400).json({ error: 'Selección no válida (entre 1 y 200 ofertas).' });
    }
    const filtro = `id=in.(${ids.join(',')})`;
    if (b.accion === 'eliminar') await sbDelete('ofertas', filtro);
    else await sbUpdate('ofertas', filtro, simples[b.accion]());
    await registrar(`${b.accion}_lote`, 'oferta', null, { cantidad: ids.length, ids });
    return res.status(200).json({ ok: true, afectadas: ids.length });
  }

  // ---- Una oferta ----
  if (!UUID.test(b.id || '')) return res.status(400).json({ error: 'Identificador no válido' });
  const filtro = `id=eq.${b.id}`;
  const [actual] = await sbSelect('ofertas', `${filtro}&select=id,titulo_oferta,empresa_nombre`);
  if (!actual) return res.status(404).json({ error: 'La oferta ya no existe.' });
  const resumen = { titulo: actual.titulo_oferta, empresa: actual.empresa_nombre };

  if (b.accion === 'eliminar') {
    await sbDelete('ofertas', filtro);
    await registrar('eliminar', 'oferta', b.id, resumen);
    return res.status(200).json({ ok: true });
  }

  if (b.accion === 'editar') {
    const { cambios, error } = validarEdicionOferta(b.datos);
    if (error) return res.status(400).json({ error });
    // Por defecto una oferta editada queda protegida de la ingesta automática
    if (cambios.editada_manualmente === undefined) cambios.editada_manualmente = true;
    cambios.ultima_edicion_admin = new Date().toISOString();
    await sbUpdate('ofertas', filtro, cambios);
    await registrar('editar', 'oferta', b.id, { ...resumen, campos: Object.keys(cambios).filter((k) => k !== 'ultima_edicion_admin') });
    return res.status(200).json({ ok: true });
  }

  if (!simples[b.accion]) return res.status(400).json({ error: 'Acción no válida.' });
  await sbUpdate('ofertas', filtro, simples[b.accion]());
  await registrar(b.accion, 'oferta', b.id, resumen);
  return res.status(200).json({ ok: true });
}

// Una suscripción viva en Stripe manda sobre el plan: no se cambia a mano para no descuadrar los cobros
async function tieneSuscripcionViva(clienteStripe) {
  const r = await stripe('/v1/subscriptions', { customer: clienteStripe, status: 'all', limit: 10 }, 'GET');
  return (r.data || []).some((s) => ESTADOS_SUSCRIPCION_VIVA.includes(s.status));
}

async function accionUsuario(b, res) {
  if (!UUID.test(b.id || '')) return res.status(400).json({ error: 'Identificador no válido' });
  const filtro = `id=eq.${b.id}`;
  const [u] = await sbSelect('usuarios', `${filtro}&select=id,email,nombre_completo,plan_stripe,stripe_customer_id,insignia_verificado`);
  if (!u) return res.status(404).json({ error: 'El usuario ya no existe.' });
  const quien = { email: u.email };

  switch (b.accion) {
    case 'verificar':
      await sbUpdate('usuarios', filtro, { insignia_verificado: true, estado_verificacion: 'Aprobado' });
      break;
    case 'quitar_verificacion':
      await sbUpdate('usuarios', filtro, { insignia_verificado: false, estado_verificacion: 'Pendiente' });
      break;
    case 'rechazar_pitch':
      // Se borra el enlace para que pueda enviar otro; si ya está verificado la insignia no se toca
      await sbUpdate('usuarios', filtro, {
        url_pitch_loom: null,
        ...(u.insignia_verificado ? {} : { estado_verificacion: 'Pendiente' }),
      });
      break;
    case 'reset_postulaciones':
      await sbUpdate('usuarios', filtro, { postulaciones_restantes: LIMITES_PLAN[u.plan_stripe] ?? 1 });
      quien.plan = u.plan_stripe;
      break;
    case 'set_plan': {
      if (!LIMITES_PLAN[b.plan]) return res.status(400).json({ error: 'Plan no válido.' });
      if (u.stripe_customer_id && (await tieneSuscripcionViva(u.stripe_customer_id))) {
        return res.status(409).json({ error: 'Este usuario tiene una suscripción activa en Stripe. Cambia o cancela el plan desde Stripe, no desde aquí.' });
      }
      await sbUpdate('usuarios', filtro, { plan_stripe: b.plan, postulaciones_restantes: LIMITES_PLAN[b.plan] });
      quien.de = u.plan_stripe;
      quien.a = b.plan;
      break;
    }
    case 'eliminar':
      // Borrar el cliente en Stripe cancela al instante cualquier suscripción activa
      if (u.stripe_customer_id) {
        try {
          await stripe(`/v1/customers/${encodeURIComponent(u.stripe_customer_id)}`, {}, 'DELETE');
        } catch (e) {
          if (!(e.stripe && e.stripe.code === 'resource_missing')) throw e;
        }
      }
      await sbRpc('eliminar_cuenta_usuario', { p_usuario: u.id });
      break;
    default:
      return res.status(400).json({ error: 'Acción no válida.' });
  }

  await registrar(b.accion, 'usuario', b.id, quien);
  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!(await autorizar(req, res))) return;

  try {
    const b = leerJson(req);
    const entidad = b.entidad || 'oferta';
    if (entidad === 'oferta') return await accionOferta(b, res);
    if (entidad === 'usuario') return await accionUsuario(b, res);
    return res.status(400).json({ error: 'Entidad no válida.' });
  } catch (err) {
    console.error('admin-actualizar-oferta:', err);
    return res.status(500).json({ error: 'No se ha podido completar la acción. Revisa los registros de Vercel.' });
  }
};
