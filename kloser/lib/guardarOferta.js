// lib/guardarOferta.js
//
// Usado por las 3 ingestas automáticas: inserta o actualiza una
// oferta ya clasificada, y gestiona el cierre automático de las
// que llevan varios días sin verse en su fuente de origen.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIAS_ANTES_DE_CERRAR = 3; // si llevamos 3 días sin ver la oferta en el origen, la damos por cerrada

async function upsertOfertaAutomatica({ clasificada, fuente, idExterno, urlOrigen }) {
  const fila = {
    titulo_oferta: clasificada.titulo,
    empresa_nombre: clasificada.empresa === 'No especificado' ? null : clasificada.empresa,
    rol_requerido: clasificada.rol,
    modalidad_oferta: clasificada.modalidad === 'No especificado' ? null : clasificada.modalidad,
    pais_oferta: clasificada.pais === 'No especificado' ? null : clasificada.pais,
    ciudad_provincia_oferta: clasificada.ciudad_provincia,
    target_oferta: clasificada.target === 'No especificado' ? null : clasificada.target,
    rango_ticket_oferta: clasificada.rango_ticket === 'No especificado' ? null : clasificada.rango_ticket,
    sector_oferta: clasificada.sector,
    tipo_remuneracion: clasificada.tipo_remuneracion === 'No especificado' ? null : clasificada.tipo_remuneracion,
    url_origen: urlOrigen,
    fuente,
    fuente_tipo: 'automatica',
    id_externo: idExterno,
    ultima_vista_en_origen: new Date().toISOString(),
    estado_oferta: 'Activa',
  };

  // Si ya existe (misma fuente + mismo id externo), la actualizamos
  // y la marcamos "vista hoy"; si no, la creamos.
  const { data: existente } = await supabase
    .from('ofertas')
    .select('id')
    .eq('fuente', fuente)
    .eq('id_externo', idExterno)
    .maybeSingle();

  if (existente) {
    await supabase.from('ofertas').update(fila).eq('id', existente.id);
  } else {
    await supabase.from('ofertas').insert(fila);
  }
}

// Tras cada ingesta, cierra las ofertas de esa fuente que llevan
// varios días sin aparecer en los resultados frescos — es decir,
// probablemente la empresa ya cerró el proceso o la retiró.
async function cerrarOfertasDesaparecidas(fuente) {
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_ANTES_DE_CERRAR);

  const { data, error } = await supabase
    .from('ofertas')
    .update({ estado_oferta: 'Cerrada' })
    .eq('fuente', fuente)
    .eq('estado_oferta', 'Activa')
    .lt('ultima_vista_en_origen', limite.toISOString())
    .select('id');

  return { cerradas: data?.length ?? 0, error };
}

module.exports = { upsertOfertaAutomatica, cerrarOfertasDesaparecidas };
