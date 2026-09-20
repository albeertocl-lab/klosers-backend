-- ============================================================
-- KLOSERS — Esquema de base de datos (Supabase / PostgreSQL)
-- Réplica fiel de las tablas de Airtable: Usuarios, Ofertas,
-- Matches, Empresas — con las mismas columnas y catálogos
-- que ya validamos en la Biblia Técnica y en Airtable real.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- TABLA: empresas (se crea primero por la relación con ofertas)
-- ------------------------------------------------------------
create table empresas (
  id uuid primary key default uuid_generate_v4(),
  nombre_empresa text not null,
  email_contacto text,
  sector_empresa text[] default '{}',
  plan_empresa text check (plan_empresa in ('Gratis','Destacado','Acceso a Base de Datos')) default 'Gratis',
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- TABLA: usuarios
-- ------------------------------------------------------------
create table usuarios (
  -- Usamos el mismo id que Supabase Auth genera al registrarse,
  -- así usuarios.id = auth.users.id (recomendado en Supabase).
  id uuid primary key default uuid_generate_v4(),
  nombre_completo text not null,
  email text unique not null,

  rol_comercial text[] default '{}',
  -- Valores válidos: Setter, Cold Caller, SDR, BDR, Closer High Ticket,
  -- Account Executive (AE), Account Manager (AM), Key Account Manager (KAM),
  -- Customer Success Manager (CSM), Ingeniero de Ventas,
  -- Comercial de Campo / Delegado, Jefe de Ventas, Director Comercial, Otro

  modalidad text check (modalidad in ('Presencial','Híbrido','Remoto','Me adapto a todo')),
  pais text check (pais in ('España','Latinoamérica','Resto del mundo')),
  ciudad_provincia text,
  movilidad text check (movilidad in ('Provincial','Nacional','Internacional','Sin movilidad')),
  vehiculo_propio boolean default false,

  target text check (target in ('B2B','B2C','Ambos')),
  track_record_ticket text check (track_record_ticket in ('<500€','500€-3.000€','High Ticket >3.000€','Gestión de cartera +100k€')),

  sectores_experiencia text[] default '{}',
  -- Valores válidos: Infoproductos, SaaS/Tecnología, Industrial/Maquinaria,
  -- Seguros/Finanzas, Salud/Farma, Marketing/Agencias, Retail/Horeca,
  -- Educación, Logística

  idiomas text[] default '{}',
  zona_horaria text,

  plan_stripe text check (plan_stripe in ('Rookie','Pro','Elite')) default 'Rookie',
  postulaciones_restantes integer default 1,
  stripe_customer_id text unique,

  url_pitch_loom text,
  puntuacion_ia integer,
  estado_verificacion text check (estado_verificacion in ('Pendiente','Aprobado','Revisión Manual')) default 'Pendiente',
  insignia_verificado boolean default false,

  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- TABLA: ofertas
-- ------------------------------------------------------------
create table ofertas (
  id uuid primary key default uuid_generate_v4(),
  titulo_oferta text not null,
  empresa_id uuid references empresas(id) on delete set null,

  rol_requerido text[] default '{}',
  modalidad_oferta text check (modalidad_oferta in ('Remoto','Híbrido','Presencial')),
  pais_oferta text check (pais_oferta in ('España','Latinoamérica','Resto del mundo')),
  ciudad_provincia_oferta text,
  target_oferta text check (target_oferta in ('B2B','B2C','Ambos')),
  rango_ticket_oferta text check (rango_ticket_oferta in ('<500€','500€-3.000€','High Ticket >3.000€','Gestión de cartera +100k€')),
  sector_oferta text[] default '{}',
  tipo_remuneracion text check (tipo_remuneracion in ('Fijo+Variable','Solo comisión','Gastos pagados')),

  descripcion_completa text,
  url_origen text,
  estado_oferta text check (estado_oferta in ('Activa','Cerrada','Pausada','Revisión Manual')) default 'Activa',

  fecha_publicacion date default current_date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- TABLA: matches (usuario ↔ oferta, con % de compatibilidad)
-- ------------------------------------------------------------
create table matches (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id) on delete cascade,
  oferta_id uuid references ofertas(id) on delete cascade,
  porcentaje_compatibilidad integer,
  postulado boolean default false,
  created_at timestamptz default now(),
  unique (usuario_id, oferta_id)
);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY — cada usuario ve/edita solo lo suyo;
-- las ofertas activas son públicas de lectura.
-- ------------------------------------------------------------
alter table usuarios enable row level security;
alter table ofertas enable row level security;
alter table matches enable row level security;
alter table empresas enable row level security;

create policy "Un usuario lee y edita solo su propia fila"
  on usuarios for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Cualquiera autenticado lee ofertas activas"
  on ofertas for select
  using (estado_oferta = 'Activa');

create policy "Un usuario lee y crea solo sus propios matches"
  on matches for all
  using (auth.uid() = usuario_id)
  with check (auth.uid() = usuario_id);

-- Nota: escribir/editar Ofertas y Empresas se hace con la
-- service_role key desde el backend (panel de administración
-- o el propio Claude vía chat), nunca desde el navegador del
-- usuario final — por eso no hay política de INSERT/UPDATE
-- pública sobre "ofertas" ni "empresas".
