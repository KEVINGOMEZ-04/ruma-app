/**
 * Proxy seguro y cacheado hacia TMDb v3 (oculta TMDB_API_KEY fuera del APK/Web).
 */

const ALLOWED_TMDB_PATHS = [
  /^\/search\/(movie|tv)$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/(movie|tv)\/\d+\/(watch\/providers|images|videos|credits)$/,
  /^\/tv\/\d+\/season\/\d+$/,
  /^\/trending\/(movie|tv|all)\/(day|week)$/
];

export function isAllowedTmdbEndpoint(rawEndpoint) {
  if (!rawEndpoint || typeof rawEndpoint !== 'string') return false;
  const trimmed = rawEndpoint.trim();
  if (!trimmed.startsWith('/') || trimmed.includes('..') || trimmed.includes('://')) return false;
  const pathOnly = trimmed.split('?')[0];
  return ALLOWED_TMDB_PATHS.some(rx => rx.test(pathOnly));
}

export async function handleTmdbProxy(request, env, jsonRes) {
  const reqUrl = new URL(request.url);
  const endpoint = reqUrl.searchParams.get('path') || '';
  if (!isAllowedTmdbEndpoint(endpoint)) {
    return jsonRes({ ok: false, error: 'Ruta de TMDb no permitida.' }, 400);
  }

  const apiKey = (env?.TMDB_API_KEY || '').trim();
  if (!apiKey) {
    return jsonRes({ ok: false, error: 'TMDB_API_KEY no configurada en el Worker.' }, 503);
  }

  const sep = endpoint.includes('?') ? '&' : '?';
  const upstreamUrl = `https://api.themoviedb.org/3${endpoint}${sep}api_key=${encodeURIComponent(apiKey)}&language=es-ES`;

  // Caché gratuita de Cloudflare Edge (6 horas para búsquedas y detalles)
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://ruma-tmdb-cache.internal${endpoint}`, { method: 'GET' });
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const data = await cached.json();
      return jsonRes(data, 200, { 'X-Ruma-Cache': 'HIT', 'Cache-Control': 'public, max-age=21600' });
    }
  }

  const upstream = await fetch(upstreamUrl, {
    headers: { Accept: 'application/json' }
  });
  if (!upstream.ok) {
    return jsonRes({ ok: false, error: `TMDb respondió HTTP ${upstream.status}` }, upstream.status);
  }

  const payload = await upstream.json();
  if (cache) {
    const toStore = new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' }
    });
    try { await cache.put(cacheKey, toStore); } catch (_) {}
  }

  return jsonRes(payload, 200, { 'X-Ruma-Cache': 'MISS', 'Cache-Control': 'public, max-age=21600' });
}
