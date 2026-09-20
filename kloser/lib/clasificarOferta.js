// lib/clasificarOferta.js
//
// Pieza central reutilizada por las 3 ingestas automáticas
// (InfoJobs, Adzuna, Jooble) y por el panel de administración:
// recibe el texto en bruto de una oferta (venga de donde venga:
// una API, un post de LinkedIn, un mensaje de WhatsApp...) y
// devuelve los campos exactos de nuestra tabla "ofertas".
//
// Es el mismo criterio que ya diseñamos en el Módulo 4 de la
// Biblia Técnica, ahora como una función real en vez de un
// System Prompt dentro de un módulo de Make.
//
// Requiere la variable de entorno ANTHROPIC_API_KEY
// (se obtiene en console.anthropic.com).

const SYSTEM_PROMPT = `Actúa como un analista experto en Recursos Humanos especializado en roles comerciales y de ventas B2B/B2C.

Tu tarea es leer el texto en bruto de una oferta de empleo (que puede venir desordenado, con emojis, en distintos idiomas o con formato de LinkedIn/Indeed/WhatsApp) y extraer exclusivamente la siguiente información, clasificándola dentro de estas categorías cerradas. Si un dato no aparece explícitamente ni se puede inferir con confianza razonable del contexto, usa el valor "No especificado".

Categorías y valores permitidos (usa EXACTAMENTE estas etiquetas, no inventes otras):

- "titulo": el título del puesto, en texto libre y corto
- "empresa": el nombre de la empresa, o "No especificado"
- "rol": array con uno o varios de [Setter, Cold Caller, SDR, BDR, Closer High Ticket, Account Executive (AE), Account Manager (AM), Key Account Manager (KAM), Customer Success Manager (CSM), Ingeniero de Ventas, Comercial de Campo / Delegado, Jefe de Ventas, Director Comercial, Otro]
- "modalidad": uno de [Remoto, Híbrido, Presencial, No especificado]
- "pais": uno de [España, Latinoamérica, Resto del mundo, No especificado]
- "ciudad_provincia": texto libre, o "No especificado"
- "target": uno de [B2B, B2C, Ambos, No especificado]
- "rango_ticket": uno de ["<500€", "500€-3.000€", "High Ticket >3.000€", "Gestión de cartera +100k€", "No especificado"]
- "sector": array con uno o varios de [Infoproductos, SaaS/Tecnología, Industrial/Maquinaria, Seguros/Finanzas, Salud/Farma, Marketing/Agencias, Retail/Horeca, Educación, Logística, Otro]
- "tipo_remuneracion": uno de [Fijo+Variable, Solo comisión, Gastos pagados, No especificado]

Reglas estrictas:
1. Devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin explicaciones, sin comillas markdown.
2. No inventes datos que no estén presentes o razonablemente inferibles del texto.
3. "rol" y "sector" siempre deben ser arrays, incluso si solo hay un valor.
4. Si el texto no es en absoluto una oferta de empleo comercial, devuelve todos los campos como "No especificado" y los arrays vacíos.`;

async function clasificarOferta(textoBruto) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', // rápido y barato; súbelo a 'claude-sonnet-5' si necesitas más precisión
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: textoBruto.slice(0, 8000) }],
    }),
  });

  if (!response.ok) {
    const detalle = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${detalle}`);
  }

  const data = await response.json();
  const textoRespuesta = data.content?.[0]?.text ?? '{}';

  // Extrae el JSON aunque venga con algo de texto alrededor
  const match = textoRespuesta.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolvió un JSON reconocible: ' + textoRespuesta);

  return JSON.parse(match[0]);
}

module.exports = { clasificarOferta };
