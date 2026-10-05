// api/admin-datos.js
//
// Datos de solo lectura para el panel de administración (/admin), por secciones:
//   ?seccion=resumen | ofertas | usuarios | postulaciones | ingesta | espera | comunidad | actividad
//   ?oferta=<id>   -> ficha completa de una oferta + quién se ha postulado
//   ?usuario=<id>  -> ficha completa de un comercial + sus postulaciones
// Sin parámetros devuelve { usuarios, postulaciones, ofertas } (formato del panel anterior).
//
// Se llama con la cabecera x-admin-password. Requiere: ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { sbSelect, sbRpc } = require('../lib/sesion');
const { autorizar, UUID } = require('../lib/admin');

const OFERTA_LISTA = 'id,titulo_oferta,empresa_nombre,fuente,fuente_tipo,modalidad_oferta,pais_oferta,' +
  'ciudad_provincia_oferta,target_oferta,rango_ticket_oferta,estado_oferta,fecha_publicacion,created_at,' +
  'destacado,orden_destacado,url_origen,editada_manualmente,tipo_contrato,publica';

const OFERTA_FICHA = OFERTA_LISTA + ',rol_requerido,sector_oferta,tipo_remuneracion,descripcion_completa,id_externo,ultima_vista_en_origen';

const USUARIO_LISTA = 'id,nombre_completo,email,plan_stripe,postulaciones_restantes,insignia_verificado,' +
  'estado_verificacion,url_pitch_loom,puntuacion_ia,rol_comercial,modalidad,pais,ciudad_provincia,movilidad,' +
  'target,track_record_ticket,sectores_experiencia,ticket_medio_exacto,tasa_cierre_exacta,created_at,stripe_customer_id,comunidad_bloqueado';

// El id de Stripe no sale del servidor: el panel solo necesita saber si existe
function sinStripe(u) {
  const { stripe_customer_id, ...resto } = u;
  return { ...resto, tiene_stripe: !!stripe_customer_id };
}

async function postulacionesPorOferta() {
  const filas = await sbSelect('matches', 'postulado=eq.true&select=oferta_id&limit=20000');
  const cuenta = {};
  for (const f of filas) cuenta[f.oferta_id] = (cuenta[f.oferta_id] || 0) + 1;
  return cuenta;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  if (!(await autorizar(req, res))) return;

  try {
    const q = req.query || {};

    if (q.oferta) {
      if (!UUID.test(q.oferta)) return res.status(400).json({ error: 'Identificador no válido' });
      const [oferta] = await sbSelect('ofertas', `id=eq.${q.oferta}&select=${OFERTA_FICHA}`);
      if (!oferta) return res.status(404).json({ error: 'Oferta no encontrada' });
      const postulantes = await sbSelect('matches',
        `oferta_id=eq.${q.oferta}&postulado=eq.true&select=porcentaje_compatibilidad,created_at,usuarios(nombre_completo,email)&order=created_at.desc&limit=200`);
      return res.status(200).json({ oferta, postulantes });
    }

    if (q.usuario) {
      if (!UUID.test(q.usuario)) return res.status(400).json({ error: 'Identificador no válido' });
      const [usuario] = await sbSelect('usuarios', `id=eq.${q.usuario}&select=${USUARIO_LISTA}`);
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
      const postulaciones = await sbSelect('matches',
        `usuario_id=eq.${q.usuario}&postulado=eq.true&select=porcentaje_compatibilidad,created_at,ofertas(titulo_oferta,empresa_nombre)&order=created_at.desc&limit=200`);
      return res.status(200).json({ usuario: sinStripe(usuario), postulaciones });
    }

    switch (q.seccion) {
      case 'resumen': {
        const [resumen, comunidad, ultimas] = await Promise.all([
          sbRpc('admin_resumen'),
          sbRpc('admin_resumen_comunidad'),
          sbSelect('ingesta_log', 'select=inicio,fin,resultados&order=inicio.desc&limit=1'),
        ]);
        return res.status(200).json({ resumen: { ...resumen, ...comunidad }, ingesta_ultima: ultimas[0] || null });
      }
      case 'ofertas': {
        const [ofertas, cuenta] = await Promise.all([
          sbSelect('ofertas', `select=${OFERTA_LISTA}&order=created_at.desc&limit=2000`),
          postulacionesPorOferta(),
        ]);
        return res.status(200).json({ ofertas: ofertas.map((o) => ({ ...o, postulaciones: cuenta[o.id] || 0 })) });
      }
      case 'usuarios': {
        const usuarios = await sbSelect('usuarios', `select=${USUARIO_LISTA}&order=created_at.desc&limit=2000`);
        return res.status(200).json({ usuarios: usuarios.map(sinStripe) });
      }
      case 'postulaciones': {
        const postulaciones = await sbSelect('matches',
          'postulado=eq.true&select=id,porcentaje_compatibilidad,created_at,usuarios(nombre_completo,email),ofertas(id,titulo_oferta,empresa_nombre)&order=created_at.desc&limit=1000');
        return res.status(200).json({ postulaciones });
      }
      case 'ingesta': {
        const [logs, resumen] = await Promise.all([
          sbSelect('ingesta_log', 'select=id,inicio,fin,resultados&order=inicio.desc&limit=30'),
          sbRpc('admin_resumen'),
        ]);
        return res.status(200).json({ logs, por_fuente: resumen.ofertas_por_fuente });
      }
      case 'espera': {
        const [espera, suscriptores] = await Promise.all([
          sbSelect('lista_espera_empresas', 'select=email,created_at&order=created_at.desc&limit=2000'),
          sbSelect('avisos_suscriptores', 'select=email,origen,consentimiento_at,confirmado_at&order=consentimiento_at.desc&limit=2000'),
        ]);
        return res.status(200).json({ espera, suscriptores });
      }
      case 'comunidad': {
        const [posts, comentarios, reportes] = await Promise.all([
          sbSelect('comunidad_posts', 'select=id,categoria,titulo,contenido,fijado,oculto,created_at,autor:usuarios(id,nombre_completo,email,comunidad_bloqueado)&order=created_at.desc&limit=100'),
          sbSelect('comunidad_comentarios', 'select=id,post_id,contenido,oculto,created_at,autor:usuarios(id,nombre_completo,email,comunidad_bloqueado),post:comunidad_posts(titulo)&order=created_at.desc&limit=100'),
          sbSelect('comunidad_reportes', 'select=post_id,comentario_id,motivo,created_at,usuario:usuarios(email)&order=created_at.desc&limit=300'),
        ]);
        return res.status(200).json({ posts, comentarios, reportes });
      }
      case 'actividad': {
        const actividad = await sbSelect('admin_log', 'select=created_at,accion,entidad,entidad_id,detalle&order=created_at.desc&limit=150');
        return res.status(200).json({ actividad });
      }
      default: {
        // Formato anterior, por compatibilidad con la versión antigua del panel
        const [usuarios, postulaciones, ofertas] = await Promise.all([
          sbSelect('usuarios', `select=${USUARIO_LISTA}&order=created_at.desc&limit=1000`),
          sbSelect('matches', 'postulado=eq.true&select=porcentaje_compatibilidad,created_at,usuarios(nombre_completo,email),ofertas(titulo_oferta)&order=created_at.desc&limit=500'),
          sbSelect('ofertas', `select=${OFERTA_LISTA}&order=created_at.desc&limit=1000`),
        ]);
        return res.status(200).json({ usuarios: usuarios.map(sinStripe), postulaciones, ofertas });
      }
    }
  } catch (err) {
    console.error('admin-datos:', err);
    return res.status(500).json({ error: 'No se han podido cargar los datos. Revisa los registros de Vercel.' });
  }
};
