// lib/stripe.js
//
// Cliente mínimo de la API REST de Stripe (sin librería) y verificación de la firma de los webhooks.
// Requiere: STRIPE_SECRET_KEY (y STRIPE_WEBHOOK_SECRET para los webhooks)

const crypto = require('crypto');

// Stripe espera formularios con notación de corchetes: line_items[0][price]=...
function aForm(obj, prefijo, salida = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') aForm(item, `${clave}[${i}]`, salida);
        else salida.push([`${clave}[${i}]`, String(item)]);
      });
    } else if (typeof v === 'object') {
      aForm(v, clave, salida);
    } else {
      salida.push([clave, String(v)]);
    }
  }
  return salida;
}

async function stripe(ruta, params = {}, metodo = 'POST') {
  const form = new URLSearchParams(aForm(params)).toString();
  const opciones = {
    method: metodo,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  };
  let url = `https://api.stripe.com${ruta}`;
  if (metodo === 'POST') {
    opciones.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opciones.body = form;
  } else if (metodo === 'GET' && form) {
    url += `?${form}`;
  }

  const r = await fetch(url, opciones);
  const datos = await r.json();
  if (!r.ok) {
    const e = new Error((datos.error && datos.error.message) || `Stripe ${r.status}`);
    e.stripe = datos.error || {};
    e.status = r.status;
    throw e;
  }
  return datos;
}

// Comprueba la cabecera Stripe-Signature contra el cuerpo CRUDO de la petición.
function firmaValida(cuerpoCrudo, cabecera, secreto, toleranciaSeg = 300) {
  if (!cabecera || !secreto) return false;
  const partes = cabecera.split(',').map((p) => p.trim().split('='));
  const t = (partes.find((p) => p[0] === 't') || [])[1];
  const firmas = partes.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || !firmas.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranciaSeg) return false;

  const esperada = crypto
    .createHmac('sha256', secreto)
    .update(`${t}.${Buffer.from(cuerpoCrudo).toString('utf8')}`)
    .digest('hex');

  return firmas.some(
    (f) => f.length === esperada.length && crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada))
  );
}

module.exports = { stripe, firmaValida, aForm };
