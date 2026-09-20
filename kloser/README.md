# Klosers — Backend real (Supabase + Stripe + Deal Flow)

Este es el andamiaje de código completo: pagos reales, base de datos persistente, y el "Deal Flow" — la captación de ofertas desde fuentes automáticas y manuales, con cierre automático y avisos de revisión. Nada de esto se ejecuta solo — cada paso de aquí abajo requiere que tú crees cuentas y pegues claves; yo no puedo hacerlo por ti desde el chat.

## Qué resuelve cada pieza

| Archivo | Qué hace |
|---|---|
| `supabase-schema.sql` | Las tablas base (Usuarios, Ofertas, Matches, Empresas) |
| `supabase-migracion-v2-seguimiento.sql` | Añade seguimiento de fuente/estado a Ofertas |
| `lib/clasificarOferta.js` | Convierte cualquier texto en bruto en una oferta estructurada (IA) |
| `lib/guardarOferta.js` | Inserta/actualiza ofertas automáticas y cierra las desaparecidas |
| `api/ingest-infojobs.js` / `ingest-adzuna.js` / `ingest-jooble.js` | Ingesta automática desde cada fuente |
| `api/ingest-todas.js` | Cron único que dispara las 3 ingestas (por límites del plan gratuito de Vercel) |
| `api/alerta-semanal-manual.js` | Email semanal preguntando el estado de las ofertas manuales |
| `api/actualizar-estado.js` | Lo que se abre al hacer clic en los botones de ese email |
| `api/clasificar-oferta.js` + `api/add-oferta.js` | Usados por el panel de administración |
| `public/admin/index.html` | El panel: pegar oferta → extraer con IA → revisar → guardar |
| `api/create-checkout-session.js` + `api/stripe-webhook.js` | Pagos (Stripe) |
| `api/reset-postulaciones-semanal.js` | Reset semanal de postulaciones por plan |

## Qué está automatizado y qué es manual (resumen)

| Fuente | Tipo | Cierre automático al desaparecer |
|---|---|---|
| InfoJobs | Automática | Sí — tras 3 días sin verla |
| Adzuna | Automática | Sí — tras 3 días sin verla |
| Jooble | Automática | Sí — tras 3 días sin verla |
| LinkedIn | Manual (tú pegas el texto, en el panel o en el chat) | No — aviso semanal por email |
| Indeed | Manual | No — aviso semanal por email |
| Closer Skool | Manual | No — aviso semanal por email |
| WhatsApp | Manual | No — aviso semanal por email |

## Pasos de despliegue

### 1. Supabase
1. SQL Editor → pega y ejecuta `supabase-schema.sql`.
2. Después, pega y ejecuta también `supabase-migracion-v2-seguimiento.sql`.
3. Copia `Project URL` y `service_role key` (Project Settings → API).
4. Activa Authentication → Providers → Email.

### 2. Stripe
(Igual que antes: crea los productos Pro/Elite, copia sus Price IDs, la Secret key, y configura el webhook una vez tengas la URL de Vercel del paso 6.)

### 3. Fuentes de ofertas automáticas
- **InfoJobs**: regístrate en developer.infojobs.net, crea una aplicación, copia `Client ID` y `Client Secret`.
- **Adzuna**: regístrate en developer.adzuna.com/signup, copia `app_id` y `app_key`.
- **Jooble**: regístrate en jooble.org/api/about, copia tu clave de API.

### 4. Resend (para el email semanal)
1. Crea cuenta gratuita en resend.com.
2. Verifica un dominio propio (o usa el modo de pruebas mientras validas).
3. Copia tu `API Key`.
4. Define `ADMIN_ALERT_EMAIL` con el email de dirección que debe recibir los avisos.

### 5. Anthropic (para el clasificador de ofertas)
1. Crea una clave en console.anthropic.com → API Keys.
2. Esta clave consume crédito de pago por uso (muy barato para este volumen: es un modelo pequeño clasificando texto corto).

### 6. Desplegar en Vercel
1. Sube esta carpeta completa a GitHub, o usa `vercel deploy` desde tu ordenador.
2. En Settings → Environment Variables, añade **todas** las variables de `.env.example`.
3. Despliega.
4. Vuelve a Stripe y a cada fuente para actualizar las URLs de webhook/callback con tu dominio real de Vercel.

### 7. Panel de administración
Una vez desplegado, entra en `https://tudominio.vercel.app/admin` — te pedirá la contraseña que pusiste en `ADMIN_PASSWORD`. Ahí puedes pegar cualquier oferta (LinkedIn, Indeed, Closer Skool, WhatsApp) y guardarla con un clic, sin pasar por el chat.

**Importante sobre seguridad de este panel:** la contraseña viaja en una cabecera HTTP simple — es una protección razonable para un panel de uso personal, pero no de nivel bancario. Si en el futuro añades más gente al equipo, migra este acceso a Supabase Auth con un rol de "admin" en vez de una contraseña compartida.

### 8. Límite de Cron Jobs en el plan gratuito de Vercel
La documentación de Vercel sobre esto ha cambiado con el tiempo — verifica al desplegar si tu cuenta acepta los 3 crons configurados en `vercel.json`. Si el despliegue falla por límite de crons, alternativa gratuita: usa un servicio externo como cron-job.org (gratis) para llamar a cada endpoint por su URL con la cabecera `Authorization: Bearer TU_CRON_SECRET`, en vez de depender de los crons nativos de Vercel.

## Notas de seguridad importantes
- La `service_role key` de Supabase, la `Secret key` de Stripe y la `ANTHROPIC_API_KEY` **nunca** deben aparecer en el código del frontend — solo viven en las variables de entorno del backend.
- El endpoint de reset semanal y las 3 ingestas están protegidos con `CRON_SECRET`.
- Los enlaces del email semanal usan un token único por oferta — no los reenvíes ni los publiques.
