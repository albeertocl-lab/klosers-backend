// api/stripe-webhook.js
//
// Recibe los avisos de Stripe cuando alguien contrata, cambia o
// cancela su suscripción, y actualiza el plan del usuario en
// Supabase — esta es la pieza que Módulo 3 de la Biblia Técnica
// resolvía con Make + Airtable; aquí es código directo.
//
// IMPORTANTE: este endpoint necesita el body en bruto (sin parsear)
// para poder verificar la firma de Stripe — por eso se desactiva
// el bodyParser de Vercel.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mapea el Price ID de Stripe (Pro / Elite) al plan y al número
// de postulaciones semanales que le corresponden — mismos valores
// que definimos en el Módulo 3 (Rookie=1, Pro=5, Elite=ilimitadas).
const PLAN_BY_PRICE = {
  [process.env.STRIPE_PRICE_PRO]: { plan: 'Pro', postulaciones: 5 },
  [process.env.STRIPE_PRICE_ELITE]: { plan: 'Elite', postulaciones: 999999 },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma de Stripe inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // Alguien contrata Pro o Elite, o cambia de uno a otro
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const priceId = sub.items.data[0]?.price?.id;
        const info = PLAN_BY_PRICE[priceId];

        if (info) {
          await supabase
            .from('usuarios')
            .update({
              plan_stripe: info.plan,
              postulaciones_restantes: info.postulaciones,
            })
            .eq('stripe_customer_id', sub.customer);
        }
        break;
      }

      // Alguien cancela su suscripción → vuelve a Rookie automáticamente
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabase
          .from('usuarios')
          .update({
            plan_stripe: 'Rookie',
            postulaciones_restantes: 1,
          })
          .eq('stripe_customer_id', sub.customer);
        break;
      }

      default:
        // Otros eventos de Stripe no nos afectan, los ignoramos
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error procesando el webhook de Stripe:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
