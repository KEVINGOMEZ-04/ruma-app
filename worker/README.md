# ruma Backend — Cloudflare Worker (Opción B, \$0/mes)

Backend ligero y gratuito (100,000 peticiones/día gratis sin tarjeta en Firebase) que centraliza las operaciones de servidor obligatorias para seguridad, 2.º plano y Google Play Store:

- `GET /api/tmdb?path=...` — Proxy seguro + caché Edge (6 h) para ocultar `TMDB_API_KEY` fuera del APK.
- `POST /api/auth/resolve-identifier` — Resuelve `@usuario` → correo para Firebase Auth sin exponer `/accounts`.
- `POST /api/groups/join` — Une usuarios a grupos por código de 6 caracteres sin exponer `/groups`.
- `POST / DELETE /api/push/register` y `POST /api/push/group-event` — Envío de notificaciones Push vía **FCM HTTP v1** (gratis en Firebase Spark).
- `POST /api/ugc/report` — Recepción de reportes UGC (obligatorio en Google Play).
- `POST /api/webhooks/revenuecat` y `GET /api/billing/status` — Estado autoritativo de `ruma Plus` (Google Play Billing v8+).
- `DELETE /api/account` — Eliminación definitiva de cuenta (Firebase Auth + RTDB + dispositivos FCM).

## Despliegue en 3 pasos

1. Inicia sesión en tu cuenta gratuita de Cloudflare:
   ```bash
   cd worker
   npm install
   npx wrangler login
   ```
2. Carga los 3 secretos de producción (nunca se guardan en Git):
   ```bash
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON   # Pega el JSON de cuenta de servicio de Firebase
   npx wrangler secret put TMDB_API_KEY                    # Tu nueva API Key rotada de TMDb
   npx wrangler secret put REVENUECAT_WEBHOOK_SECRET       # Token Bearer que configures en RevenueCat
   ```
3. Despliega el Worker:
   ```bash
   npx wrangler deploy
   ```
   Copia la URL resultante (`https://ruma-backend.<tu-subdominio>.workers.dev`) en `VITE_BACKEND_API_URL` (GitHub Secrets / `.env.local`).
