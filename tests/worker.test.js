import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleWorkerRequest } from '../worker/src/index.js';
import { isAllowedTmdbEndpoint } from '../worker/src/routes/tmdb.js';
import { resetAdminCachesForTests } from '../worker/src/firebase-admin.js';

describe('Cloudflare Worker Backend (Opción B)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAdminCachesForTests();
  });

  it('responds OK on /health with strict security headers and CORS', async () => {
    const req = new Request('https://ruma-backend.workers.dev/health', {
      headers: { Origin: 'https://kevingomez-04.github.io' }
    });
    const res = await handleWorkerRequest(req, {
      ALLOWED_ORIGINS: 'https://kevingomez-04.github.io,https://localhost'
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://kevingomez-04.github.io');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const body = await res.json();
    expect(body).toEqual({ ok: true, service: 'ruma-backend', appId: 'app.ruma.social' });
  });

  it('enforces strict TMDb path allowlist to block SSRF or arbitrary upstream paths', () => {
    expect(isAllowedTmdbEndpoint('/search/movie?query=arcane')).toBe(true);
    expect(isAllowedTmdbEndpoint('/tv/94605/season/1')).toBe(true);
    expect(isAllowedTmdbEndpoint('/movie/550/watch/providers')).toBe(true);

    expect(isAllowedTmdbEndpoint('/account/123')).toBe(false);
    expect(isAllowedTmdbEndpoint('https://evil.test/steal')).toBe(false);
    expect(isAllowedTmdbEndpoint('/search/movie/../../account')).toBe(false);
  });

  it('proxies valid TMDb requests without exposing TMDB_API_KEY to the client', async () => {
    let fetchedUrl = '';
    globalThis.fetch = vi.fn(async (url) => {
      fetchedUrl = String(url);
      return new Response(JSON.stringify({ results: [{ id: 550, title: 'Fight Club' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const req = new Request('https://ruma-backend.workers.dev/api/tmdb?path=%2Fsearch%2Fmovie%3Fquery%3Dfight');
    const res = await handleWorkerRequest(req, { TMDB_API_KEY: 'server_secret_key' });
    expect(res.status).toBe(200);
    expect(fetchedUrl).toContain('api_key=server_secret_key');
    const data = await res.json();
    expect(data.results[0].title).toBe('Fight Club');
  });

  it('rejects protected endpoints with 401 when Authorization Bearer token is missing or malformed', async () => {
    for (const [method, path] of [
      ['POST', '/api/groups/join'],
      ['POST', '/api/push/register'],
      ['POST', '/api/push/group-event'],
      ['POST', '/api/ugc/report'],
      ['GET', '/api/billing/status'],
      ['DELETE', '/api/account']
    ]) {
      const req = new Request(`https://ruma-backend.workers.dev${path}`, { method });
      const res = await handleWorkerRequest(req, { FIREBASE_PROJECT_ID: 'luma-f53ee' });
      expect(res.status).toBe(401);
    }
  });

  it('rejects RevenueCat webhook calls with wrong or missing Bearer secret', async () => {
    const req = new Request('https://ruma-backend.workers.dev/api/webhooks/revenuecat', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong_secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE', app_user_id: 'u1' } })
    });
    const res = await handleWorkerRequest(req, { REVENUECAT_WEBHOOK_SECRET: 'real_secret_123' });
    expect(res.status).toBe(401);
  });
});
