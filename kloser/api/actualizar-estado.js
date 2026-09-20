// api/actualizar-estado.js
//
// Lo que se abre cuando haces clic en un botón del email semanal.
// No requiere iniciar sesión: el "token" de la propia oferta hace
// de llave — por eso es un enlace secreto que no debes reenviar.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ESTADOS_VALIDOS = ['Activa', 'Cerrada', 'Pausada'];

function paginaHtml(mensaje, ok) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Klosers</title></head>
  <body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#FAF7EF;">
    <h1 style="color:${ok ? '#0B3D2E' : '#A5432F'};">${mensaje}</h1>
    <p>Ya puedes cerrar esta ventana.</p>
  </body></html>`;
}

export default async function handler(req, res) {
  const { token, estado } = req.query;

  if (!token || !ESTADOS_VALIDOS.includes(estado)) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(paginaHtml('Enlace no válido.', false));
  }

  const { data: oferta, error: buscarError } = await supabase
    .from('ofertas')
    .select('id, titulo_oferta')
    .eq('token_actualizacion', token)
    .maybeSingle();

  if (buscarError || !oferta) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(404).send(paginaHtml('No hemos encontrado esta oferta (el enlace puede haber caducado).', false));
  }

  await supabase.from('ofertas').update({ estado_oferta: estado }).eq('id', oferta.id);

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(
    paginaHtml(`"${oferta.titulo_oferta}" actualizada a: ${estado} ✅`, true)
  );
}
