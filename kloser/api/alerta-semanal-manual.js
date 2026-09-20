// api/alerta-semanal-manual.js
//
// Cron semanal (ver vercel.json). Para las ofertas que NO vienen
// de una fuente automática (LinkedIn, Indeed, Closer Skool,
// WhatsApp...) no hay forma de saber si siguen abiertas, así que
// te mandamos un email de un vistazo con 3 botones por oferta:
// Continuar publicando / Proceso cerrado / No se admiten más postulaciones.
// Un clic actualiza el estado al instante, sin tener que iniciar sesión.
//
// Requiere: RESEND_API_KEY (resend.com), ADMIN_ALERT_EMAIL, APP_URL

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function filaHtml(oferta) {
  const base = `${process.env.APP_URL}/api/actualizar-estado?token=${oferta.token_actualizacion}`;
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eee;">
        <strong>${oferta.titulo_oferta}</strong><br/>
        <span style="color:#666;font-size:13px;">${oferta.fuente} · publicada el ${oferta.fecha_publicacion}</span><br/><br/>
        <a href="${base}&estado=Activa" style="margin-right:10px;color:#0B3D2E;">✅ Continuar publicando</a>
        <a href="${base}&estado=Cerrada" style="margin-right:10px;color:#A5432F;">🔒 Proceso cerrado</a>
        <a href="${base}&estado=Pausada" style="color:#AD7F12;">⏸️ No admite más postulaciones</a>
      </td>
    </tr>`;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const { data: ofertas, error } = await supabase
    .from('ofertas')
    .select('*')
    .eq('fuente_tipo', 'manual')
    .eq('estado_oferta', 'Activa');

  if (error) return res.status(500).json({ error: error.message });
  if (!ofertas || ofertas.length === 0) {
    return res.status(200).json({ enviado: false, motivo: 'no hay ofertas manuales activas' });
  }

  const html = `
    <h2>Klosers — Revisión semanal de ofertas manuales</h2>
    <p>Estas ofertas no vienen de una fuente automática, así que no sabemos si la empresa las sigue teniendo abiertas. Haz clic en la opción que corresponda a cada una:</p>
    <table style="width:100%;border-collapse:collapse;">${ofertas.map(filaHtml).join('')}</table>
  `;

  const envio = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Klosers <alertas@' + (process.env.RESEND_DOMAIN || 'tudominio.com') + '>',
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Klosers — ${ofertas.length} oferta(s) pendientes de revisar`,
      html,
    }),
  });

  if (!envio.ok) {
    return res.status(500).json({ error: 'Fallo al enviar el email', detalle: await envio.text() });
  }

  await supabase
    .from('ofertas')
    .update({ ultima_alerta_enviada: new Date().toISOString() })
    .in('id', ofertas.map((o) => o.id));

  return res.status(200).json({ enviado: true, ofertas: ofertas.length });
}
