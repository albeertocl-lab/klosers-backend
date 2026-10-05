// api/publico.js
//
// Páginas públicas que se dibujan en el servidor (para que Google las lea) a partir de las ofertas
// que has marcado como «públicas» en el panel de administración:
//   /ofertas              -> listado, con filtros ?modalidad=Remoto&rol=Setter&contrato=Jornada%20completa
//   /oferta/<id>          -> ficha de una oferta, con datos estructurados JobPosting (Google for Jobs)
//   /sitemap.xml          -> mapa del sitio (páginas fijas + ofertas públicas activas)
// Las rutas se enlazan con las reglas "rewrites" de vercel.json.
//
// Solo salen ofertas con publica = true y estado Activa. Nunca se exponen el enlace de origen ni el token interno.
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (APP_URL opcional, para las direcciones absolutas)

const { sbSelect } = require('../lib/sesion');
const { esc, layout, ROLES, MODALIDADES, CONTRATOS, TODAS_LAS_PAGINAS } = require('../lib/paginas');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS = 'id,titulo_oferta,empresa_nombre,rol_requerido,modalidad_oferta,pais_oferta,ciudad_provincia_oferta,' +
  'target_oferta,rango_ticket_oferta,sector_oferta,tipo_remuneracion,tipo_contrato,descripcion_completa,fecha_publicacion,created_at';
const FILTRO_PUBLICAS = 'publica=eq.true&estado_oferta=eq.Activa';

const PAIS_ISO = { 'España': 'ES' };
const CONTRATO_SCHEMA = { 'Autónomo / Freelance': 'CONTRACTOR', 'Jornada completa': 'FULL_TIME', 'Jornada parcial': 'PART_TIME', 'Prácticas': 'INTERN' };

function base(req) {
  return (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/+$/, '');
}

function un(valor) {
  return Array.isArray(valor) ? String(valor[0] || '') : String(valor || '');
}

function fecha(o) {
  return (o.fecha_publicacion || o.created_at || '').slice(0, 10);
}

function fechaLegible(o) {
  const f = fecha(o);
  return f ? new Date(f + 'T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
}

function lugar(o) {
  return [o.ciudad_provincia_oferta, o.pais_oferta].filter(Boolean).join(', ');
}

// Datos estructurados para Google for Jobs. Solo se emiten cuando se cumplen sus requisitos mínimos:
// una marca mal rellenada es peor que ninguna.
function jobPosting(o) {
  if (!o.empresa_nombre) return null;
  const datos = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: o.titulo_oferta,
    description: String(o.descripcion_completa || o.titulo_oferta).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''),
    datePosted: fecha(o),
    directApply: false,
    hiringOrganization: { '@type': 'Organization', name: o.empresa_nombre },
  };
  const iso = PAIS_ISO[o.pais_oferta];
  if (o.modalidad_oferta === 'Remoto') {
    if (!iso) return null;
    datos.jobLocationType = 'TELECOMMUTE';
    datos.applicantLocationRequirements = { '@type': 'Country', name: iso };
  } else {
    if (!iso || !o.ciudad_provincia_oferta) return null;
    datos.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: o.ciudad_provincia_oferta, addressCountry: iso } };
  }
  if (CONTRATO_SCHEMA[o.tipo_contrato]) datos.employmentType = CONTRATO_SCHEMA[o.tipo_contrato];
  return datos;
}

function etiquetas(o) {
  const lista = [o.modalidad_oferta, lugar(o), o.tipo_contrato, o.tipo_remuneracion, o.rango_ticket_oferta, o.target_oferta].filter(Boolean);
  return `<div class="etiquetas">${lista.map((t, i) => `<span class="etq${i > 1 ? ' clara' : ''}">${esc(t)}</span>`).join('')}</div>`;
}

function enlaceFiltro(params, clave, valor, texto) {
  const q = { ...params };
  if (valor) q[clave] = valor; else delete q[clave];
  const cadena = Object.entries(q).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const activo = (params[clave] || '') === (valor || '');
  return `<a href="/ofertas${cadena ? '?' + cadena : ''}"${activo ? ' class="activo"' : ''}>${esc(texto)}</a>`;
}

function paginaLista(ofertas, req) {
  const params = {};
  const modalidad = un(req.query && req.query.modalidad);
  const rol = un(req.query && req.query.rol);
  const contrato = un(req.query && req.query.contrato);
  if (MODALIDADES.includes(modalidad)) params.modalidad = modalidad;
  if (ROLES.includes(rol)) params.rol = rol;
  if (CONTRATOS.includes(contrato)) params.contrato = contrato;

  const lista = ofertas.filter((o) =>
    (!params.modalidad || o.modalidad_oferta === params.modalidad) &&
    (!params.rol || (o.rol_requerido || []).includes(params.rol)) &&
    (!params.contrato || o.tipo_contrato === params.contrato));

  const cuerpo = `
<p class="migas"><a href="/">Inicio</a> / Ofertas</p>
<h1>Ofertas de trabajo de ventas</h1>
<p class="entradilla">Una selección de oportunidades para closers, setters, SDR, BDR y account executives. Con tu perfil de Klosers verás además todas las demás ofertas, ordenadas por lo bien que encajan contigo.</p>
<div class="filtros" aria-label="Filtrar por modalidad">
  ${enlaceFiltro(params, 'modalidad', '', 'Cualquier modalidad')}${MODALIDADES.map((m) => enlaceFiltro(params, 'modalidad', m, m)).join('')}
</div>
<div class="filtros" aria-label="Filtrar por jornada">
  ${enlaceFiltro(params, 'contrato', '', 'Cualquier jornada')}${CONTRATOS.map((c) => enlaceFiltro(params, 'contrato', c, c)).join('')}
</div>
${lista.length ? `<div class="lista-ofertas">${lista.map((o) => `
  <a class="oferta" href="/oferta/${esc(o.id)}">
    <h2>${esc(o.titulo_oferta)}</h2>
    <p class="empresa">${esc(o.empresa_nombre || 'Empresa confidencial')}</p>
    ${etiquetas(o)}
    <p class="meta">Publicada el ${esc(fechaLegible(o))}</p>
  </a>`).join('')}</div>`
    : `<div class="vacio"><p><strong>Ahora mismo no hay ofertas públicas con estos filtros.</strong></p><p>Crea tu perfil gratis y te enseñamos las que encajan contigo.</p><p><a class="boton" href="/?registro=1">Crear mi perfil gratis</a></p></div>`}
<div class="cta">
  <h2>Mucho más que un listado</h2>
  <p>Con tu perfil de Klosers calculamos tu compatibilidad con cada oferta, te verificamos como comercial y practicas tu pitch con IA.</p>
  <a class="boton" href="/?registro=1">Crear mi perfil gratis</a>
</div>`;
  return layout({
    titulo: 'Ofertas de trabajo de ventas: closer, setter, SDR, BDR | Klosers',
    descripcion: 'Ofertas de trabajo para perfiles de ventas: closers, setters, SDR, BDR y account executives. Filtra por modalidad y jornada y crea tu perfil gratis.',
    canonical: base(req) + '/ofertas',
    cuerpo,
    jsonld: [],
  });
}

function paginaOferta(o, req) {
  const cuerpo = `
<p class="migas"><a href="/">Inicio</a> / <a href="/ofertas">Ofertas</a> / ${esc(o.titulo_oferta)}</p>
<h1>${esc(o.titulo_oferta)}</h1>
<p class="entradilla">${esc(o.empresa_nombre || 'Empresa confidencial')} · publicada el ${esc(fechaLegible(o))}</p>
${etiquetas(o)}
<h2>Descripción de la oferta</h2>
<p class="descripcion">${esc(o.descripcion_completa || 'Esta oferta no incluye una descripción detallada. Crea tu perfil para ver más información y postularte.')}</p>
${(o.rol_requerido || []).length ? `<p><strong>Roles:</strong> ${esc(o.rol_requerido.join(', '))}</p>` : ''}
${(o.sector_oferta || []).length ? `<p><strong>Sectores:</strong> ${esc(o.sector_oferta.join(', '))}</p>` : ''}
<div class="cta">
  <h2>¿Te encaja esta oferta?</h2>
  <p>Crea tu perfil gratis para ver tu compatibilidad y postularte con tus métricas y tu verificación.</p>
  <a class="boton" href="/?registro=1">Crear mi perfil gratis</a>
  <p><a href="/" style="color:#F0D48A;">Ya tengo cuenta</a></p>
</div>
<div class="relacionadas"><a href="/ofertas">← Ver más ofertas</a><a href="/como-aplicar-a-ofertas-de-ventas">Cómo aplicar a ofertas de ventas</a></div>`;
  const marca = jobPosting(o);
  return layout({
    titulo: `${o.titulo_oferta}${o.empresa_nombre ? ' · ' + o.empresa_nombre : ''} | Klosers`,
    descripcion: String(o.descripcion_completa || o.titulo_oferta).replace(/\s+/g, ' ').slice(0, 155),
    canonical: `${base(req)}/oferta/${o.id}`,
    cuerpo,
    jsonld: marca ? [marca] : [],
  });
}

function pagina404(req) {
  return layout({
    titulo: 'Oferta no disponible | Klosers',
    descripcion: 'Esta oferta ya no está disponible.',
    cuerpo: `<h1>Esta oferta ya no está disponible</h1><p class="entradilla">Puede que se haya cubierto o que la empresa la haya retirado.</p>
<p><a class="boton" href="/ofertas">Ver otras ofertas</a></p>`,
    noindex: true,
  });
}

function mapaDelSitio(ofertas, req) {
  const b = base(req);
  const filas = [
    ...TODAS_LAS_PAGINAS.map((r) => `<url><loc>${esc(b + (r === '/' ? '/' : r))}</loc></url>`),
    ...ofertas.map((o) => `<url><loc>${esc(`${b}/oferta/${o.id}`)}</loc><lastmod>${esc(fecha(o))}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${filas.join('\n')}\n</urlset>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Método no permitido');
  const vista = un(req.query && req.query.vista) || 'lista';

  try {
    if (vista === 'oferta') {
      const id = un(req.query && req.query.id);
      let oferta = null;
      if (UUID.test(id)) {
        const filas = await sbSelect('ofertas', `id=eq.${id}&${FILTRO_PUBLICAS}&select=${CAMPOS}`);
        oferta = filas[0] || null;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!oferta) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(404).send(pagina404(req)); }
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).send(paginaOferta(oferta, req));
    }

    const ofertas = await sbSelect('ofertas', `${FILTRO_PUBLICAS}&select=${CAMPOS}&order=created_at.desc&limit=300`);

    if (vista === 'sitemap') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).send(mapaDelSitio(ofertas, req));
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(paginaLista(ofertas, req));
  } catch (err) {
    console.error('publico:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(layout({
      titulo: 'Error | Klosers', descripcion: 'No se ha podido cargar la página.',
      cuerpo: '<h1>No hemos podido cargar esta página</h1><p>Inténtalo de nuevo en unos minutos.</p><p><a class="boton" href="/">Volver al inicio</a></p>',
      noindex: true,
    }));
  }
};
