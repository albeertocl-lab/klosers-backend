// api/create-checkout-session.js
//
// Crea una sesión de pago de Stripe para que un usuario contrate
// el plan Pro o Elite. El frontend llama a este endpoint y
// redirige al usuario a la URL que devuelve.
//
// Variables de entorno necesarias (ver .env.example):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { usuarioId, priceId } = req.body || {};
  if (!usuarioId || !priceId) {
    return res.status(400).json({ error: 'faltan usuarioId o priceId' });
  }

  // 1. Buscamos al usuario en Supabase
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', usuarioId)
    .single();

  if (error || !usuario) {
    return res.status(404).json({ error: 'usuario_no_encontrado' });
  }

  // 2. Nos aseguramos de que tenga un Customer de Stripe asociado
  let customerId = usuario.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: usuario.email,
      name: usuario.nombre_completo,
      metadata: { usuario_id: usuarioId },
    });
    customerId = customer.id;

    await supabase
      .from('usuarios')
      .update({ stripe_customer_id: customerId })
      .eq('id', usuarioId);
  }

  // 3. Creamos la sesión de Checkout (suscripción recurrente)
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.APP_URL}/planes?checkout=cancelado`,
  });

  return res.status(200).json({ url: session.url });
}
