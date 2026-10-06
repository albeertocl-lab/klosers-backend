// api/cuenta.js
//
// Una sola función para las acciones de cuenta del comercial logueado
// (así no gastamos más de las 12 funciones que permite el plan gratuito de Vercel):
//
//   { accion: 'checkout', plan: 'Pro' | 'Elite' }  -> URL de pago de Stripe Checkout
//   { accion: 'portal' }                           -> URL del portal de Stripe (cambiar tarjeta, cancelar...)
//   { accion: 'eliminar', confirmar: 'ELIMINAR' }  -> cancela la suscripción y borra todos sus datos (RGPD)
//   { accion: 'clase', semana: 1..52 }             -> mini clase de la Academia (solo planes Pro y Elite)
//
// Se llama desde la web con "Authorization: Bearer <token de sesión de Supabase>".
// Requiere: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_ELITE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (APP_URL es opcional: si falta se usa el dominio desde el que llega la petición)

const { usuarioDesdeToken, sbSelect, sbUpdate, sbRpc, leerJson } = require('../lib/sesion');
const { stripe } = require('../lib/stripe');

async function crearCliente(perfil, user) {
  const c = await stripe('/v1/customers', {
    email: perfil.email || user.email,
    name: perfil.nombre_completo,
    metadata: { usuario_id: user.id },
  });
  await sbUpdate('usuarios', `id=eq.${encodeURIComponent(user.id)}`, { stripe_customer_id: c.id });
  return c.id;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'metodo_no_permitido' });

  try {
    const user = await usuarioDesdeToken(req);
    if (!user) return res.status(401).json({ error: 'no_autenticado' });

    const body = leerJson(req);
    const app = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/+$/, '');

    const filas = await sbSelect(
      'usuarios',
      `id=eq.${encodeURIComponent(user.id)}&select=id,email,nombre_completo,plan_stripe,stripe_customer_id`
    );
    const perfil = filas[0];
    if (!perfil) return res.status(404).json({ error: 'perfil_no_encontrado' });

    if (body.accion === 'checkout') {
      const precios = { Pro: process.env.STRIPE_PRICE_PRO, Elite: process.env.STRIPE_PRICE_ELITE };
      const precio = precios[body.plan];
      if (!precio) return res.status(400).json({ error: 'plan_invalido' });

      // Si ya paga un plan, que lo cambie desde el portal: evita suscripciones duplicadas
      if (perfil.plan_stripe && perfil.plan_stripe !== 'Rookie') {
        return res.status(409).json({ error: 'ya_tienes_plan_de_pago' });
      }

      let cliente = perfil.stripe_customer_id || (await crearCliente(perfil, user));
      const params = (cus) => ({
        mode: 'subscription',
        customer: cus,
        client_reference_id: user.id,
        line_items: [{ price: precio, quantity: 1 }],
        success_url: `${app}/?pago=ok`,
        cancel_url: `${app}/?pago=cancelado`,
        allow_promotion_codes: 'true',
        // Managed Payments: Stripe actúa como vendedor oficial (merchant of record) y se encarga del IVA
        // (cálculo, cobro e ingreso a Hacienda), de los recibos, las facturas y las disputas.
        // Requiere un código fiscal admitido en cada producto y el precio con tax_behavior definido (ya configurados).
        // Para volver a Checkout normal (Klosers factura y gestiona el IVA), cambiar 'true' por 'false'.
        managed_payments: { enabled: 'true' },
        metadata: { usuario_id: user.id, plan: body.plan },
        subscription_data: { metadata: { usuario_id: user.id, plan: body.plan } },
      });

      let sesion;
      try {
        sesion = await stripe('/v1/checkout/sessions', params(cliente));
      } catch (e) {
        // El cliente guardado ya no existe en Stripe (p. ej. se limpió el entorno de pruebas)
        if (e.stripe && e.stripe.code === 'resource_missing') {
          cliente = await crearCliente(perfil, user);
          sesion = await stripe('/v1/checkout/sessions', params(cliente));
        } else {
          throw e;
        }
      }
      return res.status(200).json({ url: sesion.url });
    }

    if (body.accion === 'portal') {
      if (!perfil.stripe_customer_id) return res.status(400).json({ error: 'sin_suscripcion' });
      try {
        const p = await stripe('/v1/billing_portal/sessions', {
          customer: perfil.stripe_customer_id,
          return_url: `${app}/`,
        });
        return res.status(200).json({ url: p.url });
      } catch (e) {
        console.error('portal Stripe:', e.message);
        return res.status(502).json({ error: 'portal_no_configurado' });
      }
    }

    if (body.accion === 'clase') {
      if (!['Pro', 'Elite'].includes(perfil.plan_stripe)) return res.status(403).json({ error: 'solo_pro' });
      const semana = Number(body.semana);
      if (!Number.isInteger(semana) || semana < 1 || semana > 52) return res.status(400).json({ error: 'semana_invalida' });
      let clases;
      try {
        // Carga perezosa: si faltara el archivo, solo fallan las clases, nunca los pagos
        clases = require('../lib/data/clases.json');
      } catch (e) {
        console.error('clases.json:', e.message);
        return res.status(503).json({ error: 'clases_no_disponibles' });
      }
      const clase = clases.find((c) => c.semana === semana);
      if (!clase) return res.status(404).json({ error: 'no_existe' });
      return res.status(200).json({ clase });
    }

    if (body.accion === 'eliminar') {
      if (body.confirmar !== 'ELIMINAR') return res.status(400).json({ error: 'falta_confirmacion' });

      // Borrar el cliente en Stripe cancela al instante cualquier suscripción activa
      if (perfil.stripe_customer_id) {
        try {
          await stripe(`/v1/customers/${encodeURIComponent(perfil.stripe_customer_id)}`, {}, 'DELETE');
        } catch (e) {
          if (!(e.stripe && e.stripe.code === 'resource_missing')) throw e;
        }
      }
      await sbRpc('eliminar_cuenta_usuario', { p_usuario: user.id });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'accion_invalida' });
  } catch (err) {
    console.error('cuenta:', err);
    return res.status(500).json({ error: 'error_interno' });
  }
};
