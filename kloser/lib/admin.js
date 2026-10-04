// lib/admin.js
//
// Utilidades compartidas por las funciones del panel de administración:
// comprobar la contraseña, anotar cada acción en el registro y validar los datos de una oferta.
//
// Requiere: ADMIN_PASSWORD

const crypto = require('crypto');
const { sbInsert } = require('./sesion');

const ROLES = ['Setter', 'Cold Caller', 'SDR', 'BDR', 'Closer High Ticket', 'Account Executive (AE)',
  'Account Manager (AM)', 'Key Account Manager (KAM)', 'Customer Success Manager (CSM)',
  'Ingeniero de Ventas', 'Comercial de Campo / Delegado', 'Jefe de Ventas', 'Director Comercial', 'Otro'];

const SECTORES = ['Infoproductos', 'SaaS/Tecnología', 'Industrial/Maquinaria', 'Seguros/Finanzas', 'Salud/Farma',
  'Marketing/Agencias', 'Retail/Horeca', 'Educación', 'Logística', 'Otro'];

const ENUMS = {
  modalidad_oferta: ['Remoto', 'Híbrido', 'Presencial'],
  pais_oferta: ['España', 'Latinoamérica', 'Resto del mundo'],
  target_oferta: ['B2B', 'B2C', 'Ambos'],
  rango_ticket_oferta: ['<500€', '500€-3.000€', 'High Ticket >3.000€', 'Gestión de cartera +100k€'],
  tipo_remuneracion: ['Fijo+Variable', 'Solo comisión', 'Gastos pagados'],
  estado_oferta: ['Activa', 'Pausada', 'Cerrada', 'Revisión Manual'],
};

// Postulaciones semanales por plan (las mismas que aplica el webhook de Stripe)
const LIMITES_PLAN = { Rookie: 1, Pro: 5, Elite: 999 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const huella = (s) => crypto.createHash('sha256').update(String(s || '')).digest();

function passwordCorrecta(req) {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) return false;
  return crypto.timingSafeEqual(huella(req.headers['x-admin-password']), huella(esperada));
}

// Comprueba la contraseña. Si falla, espera 1 s antes de responder para frenar la fuerza bruta.
async function autorizar(req, res) {
  if (passwordCorrecta(req)) return true;
  await new Promise((r) => setTimeout(r, 1000));
  res.status(401).json({ error: 'No autorizado' });
  return false;
}

// Anota una acción del admin. Si falla el registro, no se interrumpe la acción.
async function registrar(accion, entidad, entidadId, detalle) {
  try {
    await sbInsert('admin_log', {
      accion, entidad,
      entidad_id: entidadId ? String(entidadId) : null,
      detalle: detalle || null,
    });
  } catch (e) {
    console.error('admin_log:', e.message);
  }
}

function texto(v, max) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function listaCerrada(v, permitidos, nombre) {
  if (v === undefined) return { valor: undefined };
  if (!Array.isArray(v)) return { error: `${nombre} debe ser una lista.` };
  const unicos = [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
  const raro = unicos.find((x) => !permitidos.includes(x));
  if (raro) return { error: `${nombre}: valor no válido («${raro}»).` };
  return { valor: unicos };
}

// Valida lo que llega del formulario de edición y devuelve solo los campos que se pueden cambiar.
function validarEdicionOferta(d) {
  if (!d || typeof d !== 'object') return { error: 'Faltan los datos de la oferta.' };
  const c = {};

  if (d.titulo_oferta !== undefined) {
    const t = texto(d.titulo_oferta, 200);
    if (!t) return { error: 'El título no puede estar vacío.' };
    c.titulo_oferta = t;
  }
  if (d.empresa_nombre !== undefined) c.empresa_nombre = texto(d.empresa_nombre, 150);
  if (d.ciudad_provincia_oferta !== undefined) c.ciudad_provincia_oferta = texto(d.ciudad_provincia_oferta, 120);
  if (d.descripcion_completa !== undefined) c.descripcion_completa = texto(d.descripcion_completa, 20000);

  if (d.url_origen !== undefined) {
    const u = texto(d.url_origen, 1000);
    if (u && !/^https?:\/\/\S+$/i.test(u)) return { error: 'La URL de origen debe empezar por http:// o https://' };
    c.url_origen = u;
  }

  for (const campo of Object.keys(ENUMS)) {
    if (d[campo] === undefined) continue;
    const v = texto(d[campo], 60);
    if (v !== null && !ENUMS[campo].includes(v)) return { error: `Valor no válido en ${campo}.` };
    if ((campo === 'modalidad_oferta' || campo === 'estado_oferta') && v === null) {
      return { error: `${campo === 'modalidad_oferta' ? 'La modalidad' : 'El estado'} es obligatoria.` };
    }
    c[campo] = v;
  }

  const roles = listaCerrada(d.rol_requerido, ROLES, 'Rol');
  if (roles.error) return { error: roles.error };
  if (roles.valor !== undefined) c.rol_requerido = roles.valor;

  const sectores = listaCerrada(d.sector_oferta, SECTORES, 'Sector');
  if (sectores.error) return { error: sectores.error };
  if (sectores.valor !== undefined) c.sector_oferta = sectores.valor;

  if (d.editada_manualmente !== undefined) c.editada_manualmente = d.editada_manualmente === true;

  return { cambios: c };
}

module.exports = { autorizar, registrar, validarEdicionOferta, ROLES, SECTORES, ENUMS, LIMITES_PLAN, UUID };
