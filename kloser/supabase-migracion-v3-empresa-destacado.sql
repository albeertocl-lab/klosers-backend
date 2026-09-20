-- ============================================================
-- KLOSERS — Migración v3: nombre de empresa + ofertas destacadas
-- Ejecutar DESPUÉS de las migraciones v1 y v2, en el SQL Editor
-- de Supabase.
-- ============================================================

alter table ofertas
  add column if not exists empresa_nombre text,
  -- Nombre de la empresa en texto libre. Más simple que forzar
  -- una fila en la tabla "empresas" para cada ingesta automática
  -- o manual — si en el futuro quieres relacionarlo formalmente
  -- con "empresas" (para el módulo B2B), puedes migrar estos
  -- textos a esa tabla más adelante sin perder nada.

  add column if not exists destacado boolean default false,
  -- Marca si la empresa ha pagado (o tú decides) destacar esta
  -- oferta por encima del resto en el Job Board.

  add column if not exists orden_destacado integer default 0;
  -- Cuanto más alto, más arriba aparece entre las destacadas.
  -- Se incrementa automáticamente cada vez que "subes" una oferta
  -- al top desde el panel de administración.
