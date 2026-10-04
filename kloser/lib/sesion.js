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
    headers: { apikey: clave(), Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
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

module.exports = { usuarioDesdeToken, sbSelect, sbUpdate, sbInsert, sbDelete, sbRpc, leerJson };
