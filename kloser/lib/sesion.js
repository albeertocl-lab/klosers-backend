// lib/sesion.js
//
// Utilidades compartidas por las funciones de la API que atienden al comercial logueado:
// validar su sesión de Supabase y leer/escribir en la base de datos con la clave de servicio.
// Usa fetch directo (sin librerías), así no hace falta tocar package.json.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

function clave() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Clave PÚBLICA de Supabase (la misma que ya va dentro de la web, no es secreta). Se usa solo para comprobar el token de un usuario
// en /auth/v1/user, que es lo que hace cualquier navegador. Así esa comprobación no depende del formato de la clave de servicio.
const CLAVE_PUBLICA = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable__xEYUdnaER23Cjz-bqrFcw_5skLulOd';

function base() {
  return (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

function cabeceras(extra = {}) {
  return {
    apikey: clave(),
    Authorization: `Bearer ${clave()}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// Devuelve { id, email } del comercial que hace la petición, o null si el token no es válido.
async function usuarioDesdeToken(req) {
  const cab = req.headers.authorization || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
  if (!token) return null;

  const r = await fetch(`${base()}/auth/v1/user`, {
    headers: { apikey: CLAVE_PUBLICA, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    console.error('usuarioDesdeToken: Supabase rechaza el token de sesión (HTTP ' + r.status + ')');
    return null;
  }
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email } : null;
}

async function sbSelect(tabla, query) {
  const r = await fetch(`${base()}/rest/v1/${tabla}?${query}`, { headers: cabeceras() });
  if (!r.ok) throw new Error(`Supabase select ${tabla} (${r.status}): ${await r.text()}`);
  return r.json();
}

async function sbUpdate(tabla, filtro, cambios) {
  const r = await fetch(`${base()}/rest/v1/${tabla}?${filtro}`, {
    method: 'PATCH',
    headers: cabeceras({ Prefer: 'return=representation' }),
    body: JSON.stringify(cambios),
  });
  if (!r.ok) throw new Error(`Supabase update ${tabla} (${r.status}): ${await r.text()}`);
  return r.json();
}

async function sbInsert(tabla, fila) {
  const r = await fetch(`${base()}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: cabeceras({ Prefer: 'return=representation' }),
    body: JSON.stringify(fila),
  });
  if (!r.ok) throw new Error(`Supabase insert ${tabla} (${r.status}): ${await r.text()}`);
  return r.json();
}

async function sbDelete(tabla, filtro) {
  const r = await fetch(`${base()}/rest/v1/${tabla}?${filtro}`, {
    method: 'DELETE',
    headers: cabeceras({ Prefer: 'return=representation' }),
  });
  if (!r.ok) throw new Error(`Supabase delete ${tabla} (${r.status}): ${await r.text()}`);
  return r.json();
}

async function sbRpc(funcion, args) {
  const r = await fetch(`${base()}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error(`Supabase rpc ${funcion} (${r.status}): ${await r.text()}`);
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

// Cuerpo JSON de la petición, venga ya parseado, como texto o como Buffer.
function leerJson(req) {
  const b = req.body;
  if (!b) return {};
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString('utf8')); } catch { return {}; }
  }
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return {}; }
  }
  return b;
}

// ---- Almacén de archivos (Supabase Storage). Solo desde el servidor, con la clave de servicio ----
function rutaStorage(bucket, ruta) {
  return `${base()}/storage/v1/object/${encodeURIComponent(bucket)}/${String(ruta).split('/').map(encodeURIComponent).join('/')}`;
}

// Enlace temporal (en segundos) para abrir un archivo privado
async function sbStorageFirmar(bucket, ruta, segundos) {
  const url = `${base()}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${String(ruta).split('/').map(encodeURIComponent).join('/')}`;
  const r = await fetch(url, { method: 'POST', headers: cabeceras(), body: JSON.stringify({ expiresIn: segundos }) });
  if (!r.ok) throw new Error(`Storage firmar (${r.status})`);
  const d = await r.json();
  if (!d || !d.signedURL) throw new Error('Storage firmar: respuesta sin enlace');
  return `${base()}/storage/v1${d.signedURL}`;
}

// Borra un archivo. Que ya no exista no es un error; cualquier otro fallo sí, para no dejar archivos huérfanos.
async function sbStorageBorrar(bucket, ruta) {
  const r = await fetch(rutaStorage(bucket, ruta), { method: 'DELETE', headers: cabeceras() });
  if (r.ok || r.status === 404) return true;
  const cuerpo = await r.text().catch(() => '');
  if (/not.?found/i.test(cuerpo)) return true;
  throw new Error(`Storage borrar (${r.status})`);
}

module.exports = { usuarioDesdeToken, sbSelect, sbUpdate, sbInsert, sbDelete, sbRpc, leerJson, sbStorageFirmar, sbStorageBorrar };
