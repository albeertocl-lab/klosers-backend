-- ============================================================
-- KLOSERS — Migración v2: seguimiento de fuente y estado
-- Ejecutar DESPUÉS de supabase-schema.sql, en el SQL Editor
-- de Supabase (pegar todo y darle a Run).
-- ============================================================

alter table ofertas
  add column if not exists fuente text default 'Manual',
  -- Ej: 'InfoJobs', 'Adzuna', 'Jooble', 'LinkedIn (manual)',
  -- 'Indeed (manual)', 'Closer Skool (manual)', 'WhatsApp (manual)'

  add column if not exists fuente_tipo text check (fuente_tipo in ('automatica','manual')) default 'manual',

  add column if not exists id_externo text,
  -- El id que la propia fuente le da a la oferta (InfoJobs/Adzuna/Jooble).
  -- Nos sirve para saber, la próxima vez que consultemos esa fuente, si
  -- esta oferta concreta sigue existiendo o ya ha desaparecido.

  add column if not exists token_actualizacion text unique default encode(gen_random_bytes(24), 'hex'),
  -- Token secreto único por oferta, usado en los enlaces del email
  -- semanal para poder cambiar el estado sin necesidad de iniciar sesión.

  add column if not exists ultima_alerta_enviada timestamptz,
  -- Cuándo se envió el último aviso semanal por esta oferta (para no
  -- avisar dos veces la misma semana si el cron se ejecuta más de una vez).

  add column if not exists ultima_vista_en_origen timestamptz default now();
  -- La última vez que la ingesta automática vio esta oferta todavía
  -- activa en InfoJobs/Adzuna/Jooble. Si pasan varios días sin
  -- "verla", la damos por cerrada automáticamente.

-- Vídeo-respuesta del roleplay de VideoAsk (Módulo 5, insignia "Verificado")
-- — esta sí va en usuarios, no en ofertas.
alter table usuarios
  add column if not exists videoask_response_url text;

-- Evita duplicados: una misma oferta de una misma fuente no se
-- inserta dos veces si ya existe (por su id externo).
create unique index if not exists ofertas_fuente_id_externo_idx
  on ofertas (fuente, id_externo)
  where id_externo is not null;

-- Necesitamos la extensión pgcrypto para generar los tokens aleatorios.
create extension if not exists pgcrypto;
