// lib/paginas.js
//
// Plantilla común de las páginas públicas de Klosers (ofertas, roles, guías y textos legales).
// La usa api/publico.js para dibujar las ofertas en el servidor y el script que genera las páginas estáticas,
// así todas comparten exactamente la misma cabecera, pie y metadatos.

const ROLES = ['Setter', 'Cold Caller', 'SDR', 'BDR', 'Closer High Ticket', 'Account Executive (AE)',
  'Account Manager (AM)', 'Key Account Manager (KAM)', 'Customer Success Manager (CSM)',
  'Ingeniero de Ventas', 'Comercial de Campo / Delegado', 'Jefe de Ventas', 'Director Comercial', 'Otro'];
const MODALIDADES = ['Remoto', 'Híbrido', 'Presencial'];
const CONTRATOS = ['Autónomo / Freelance', 'Jornada completa', 'Jornada parcial', 'Jornada flexible', 'Prácticas'];

// Páginas fijas del sitio (para el menú, el pie y el mapa del sitio)
const PAGINAS_ROLES = [
  ['/que-es-un-closer', 'Closer'],
  ['/que-es-un-setter', 'Setter'],
  ['/que-es-un-sdr', 'SDR'],
  ['/que-es-un-bdr', 'BDR'],
  ['/que-es-un-account-executive', 'Account Executive'],
];
const PAGINAS_GUIAS = [
  ['/trabajo-remoto-ventas', 'Trabajo remoto en ventas'],
  ['/como-aplicar-a-ofertas-de-ventas', 'Cómo aplicar a ofertas de ventas'],
];
const PAGINAS_LEGALES = [
  ['/terminos', 'Términos y condiciones'],
  ['/privacidad', 'Política de privacidad'],
  ['/cookies', 'Política de cookies'],
];
const TODAS_LAS_PAGINAS = ['/', '/ofertas', ...PAGINAS_ROLES.map((p) => p[0]), ...PAGINAS_GUIAS.map((p) => p[0]), ...PAGINAS_LEGALES.map((p) => p[0])];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Un JSON dentro de <script> nunca debe poder cerrar la etiqueta
function jsonSeguro(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function enlaces(lista) {
  return lista.map(([ruta, texto]) => `<a href="${esc(ruta)}">${esc(texto)}</a>`).join('');
}

function layout({ titulo, descripcion, canonical, cuerpo, jsonld = [], noindex = false }) {
  const og = `<meta property="og:type" content="website"><meta property="og:site_name" content="Klosers"><meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descripcion)}"><meta name="twitter:card" content="summary">`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow">'}
${canonical ? `<link rel="canonical" href="${esc(canonical)}"><meta property="og:url" content="${esc(canonical)}">` : ''}
${og}
<link rel="stylesheet" href="/publico.css">
${jsonld.map((j) => `<script type="application/ld+json">${jsonSeguro(j)}</script>`).join('\n')}
</head>
<body>
<header class="cab">
  <div class="cab-in">
    <a class="marca" href="/">KLOSERS</a>
    <nav class="menu" aria-label="Principal">
      <a href="/ofertas">Ofertas</a>
      <a href="/trabajo-remoto-ventas">Trabajo remoto</a>
      <a href="/como-aplicar-a-ofertas-de-ventas">Cómo aplicar</a>
    </nav>
    <div class="acciones">
      <a class="boton-sec" href="/">Entrar</a>
      <a class="boton" href="/?registro=1">Crear mi perfil gratis</a>
    </div>
  </div>
</header>
<main class="contenido">
${cuerpo}
</main>
<footer class="pie">
  <div class="pie-in">
    <div><p class="pie-t">Roles</p>${enlaces(PAGINAS_ROLES)}</div>
    <div><p class="pie-t">Guías</p>${enlaces(PAGINAS_GUIAS)}<a href="/ofertas">Ofertas de ventas</a></div>
    <div><p class="pie-t">Legal</p>${enlaces(PAGINAS_LEGALES)}</div>
  </div>
  <p class="pie-aviso">Klosers actúa como intermediario tecnológico: facilita el encuentro entre comerciales y ofertas, pero no es parte de las relaciones laborales o mercantiles que puedan surgir ni garantiza resultados.</p>
  <p class="pie-aviso">© 2026 Klosers. Todos los derechos reservados.</p>
</footer>
</body>
</html>`;
}

module.exports = { esc, jsonSeguro, layout, ROLES, MODALIDADES, CONTRATOS, PAGINAS_ROLES, PAGINAS_GUIAS, PAGINAS_LEGALES, TODAS_LAS_PAGINAS };
