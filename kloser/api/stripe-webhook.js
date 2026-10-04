// api/stripe-webhook.js
//
// Recibe los avisos de Stripe y mantiene el plan del comercial al día:
//   checkout.session.completed      -> activa el plan que ha comprado
//   customer.subscription.updated   -> cambio de plan (o impago definitivo)
//   customer.subscription.deleted   -> cancelación: vuelve a Rookie
//
// Configuración en Stripe (Developers -> Webhooks -> Add endpoint):
//   URL:     https://klosers-backend.vercel.app/api/stripe-webhook
//   Eventos: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
//   Después copia el "Signing secret" (whsec_...) a la variable STRIPE_WEBHOOK_SECRET de Vercel.
//
// Requiere: STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_ELITE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { sbSelect, sbUpdate } = require('../lib/sesion');
const { firmaValida } = require('../lib/stripe');

// Postulaciones semanales que recibe cada plan al activarse (Elite es ilimitado: lo aplica la función postular)
const LIMITES = { Rookie: 1, Pro: 5, Elite: 999 };

const ESTADOS_ACTIVOS = ['active', 'trialing'];
const ESTADOS_SIN_CAMBIO = ['past_due', 'incomplete']; // Stripe sigue reintentando el cobro

function planDesdePrecio(idPrecio) {
  if (idPrecio && idPrecio === process.env.STRIPE_PRICE_PRO) return 'Pro';
  if (idPrecio && idPrecio === process.env.STRIPE_PRICE_ELITE) return 'Elite';
  return null;
}

// El cuerpo debe leerse crudo: la firma se calcula sobre los bytes exactos que envía Stripe.
async function cuerpoCrudo(req) {
  const trozos = [];
  for await (const t of req) trozos.push(typeof t === 'string' ? Buffer.from(t) : t);
  return Buffer.concat(trozos);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'metodo_no_permitido' });

  const crudo = await cuerpoCrudo(req);
  if (!firmaValida(crudo, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).json({ error: 'firma_invalida' });
  }

  let evento;
  try {
    evento = JSON.parse(crudo.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'cuerpo_invalido' });
  }

  try {
    const obj = evento.data && evento.data.object;

    if (evento.type === 'checkout.session.completed' && obj && obj.mode === 'subscription') {
      const usuarioId = obj.client_reference_id || (obj.metadata && obj.metadata.usuario_id);
      const plan = obj.metadata && obj.metadata.plan;
      if (usuarioId && LIMITES[plan]) {
        await sbUpdate('usuarios', `id=eq.${encodeURIComponent(usuarioId)}`, {
          plan_stripe: plan,
          postulaciones_restantes: LIMITES[plan],
          stripe_customer_id: obj.customer,
        });
      }
    }

    if (evento.type === 'customer.subscription.updated' || evento.type === 'customer.subscription.deleted') {
      let plan = null;
      if (evento.type === 'customer.subscription.deleted') {
        plan = 'Rookie';
      } else if (ESTADOS_ACTIVOS.includes(obj.status)) {
        const item = obj.items && obj.items.data && obj.items.data[0];
        plan = planDesdePrecio(item && item.price && item.price.id);
      } else if (!ESTADOS_SIN_CAMBIO.includes(obj.status)) {
        plan = 'Rookie'; // canceled, unpaid, incomplete_expired...
      }

      if (plan) {
        const filas = await sbSelect(
          'usuarios',
          `stripe_customer_id=eq.${encodeURIComponent(obj.customer)}&select=id,plan_stripe`
        );
        const u = filas[0];
        // Solo se reinicia el contador si el plan cambia de verdad
        if (u && u.plan_stripe !== plan) {
          await sbUpdate('usuarios', `id=eq.${encodeURIComponent(u.id)}`, {
            plan_stripe: plan,
            postulaciones_restantes: LIMITES[plan],
          });
        }
      }
    }

    return res.status(200).json({ recibido: true });
  } catch (err) {
    console.error('stripe-webhook:', err);
    return res.status(500).json({ error: 'error_interno' }); // Stripe reintentará
  }
};
