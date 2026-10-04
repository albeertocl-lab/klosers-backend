// lib/anthropic.js
//
// Llamada mínima a la API de Anthropic (mismo modelo económico que usa el clasificador de ofertas).
// Requiere: ANTHROPIC_API_KEY

async function claude({ system, messages, max_tokens = 400, model = 'claude-haiku-4-5-20251001' }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens, system, messages }),
  });
  if (!r.ok) {
    // El detalle va solo al log del servidor, nunca al navegador
    throw new Error(`Anthropic API (${r.status}): ${await r.text()}`);
  }
  const datos = await r.json();
  return (datos.content && datos.content[0] && datos.content[0].text) || '';
}

module.exports = { claude };
