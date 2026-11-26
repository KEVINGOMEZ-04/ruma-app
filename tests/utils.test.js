import { describe, it, expect } from 'vitest';
import { Utils } from '../src/core/utils.js';

describe('Utils.sanitize (AUD-02 XSS protection)', () => {
  it('escapes all five HTML-sensitive characters including double and single quotes', () => {
    const raw = `<script>alert("x" & 'y')</script>`;
    const out = Utils.sanitize(raw);
    expect(out).toBe('&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;');
    expect(out).not.toContain('"');
    expect(out).not.toContain("'");
    expect(out).not.toContain('<');
  });

  it('prevents attribute breakout payloads', () => {
    const payload = `a" onmouseover="alert(1)`;
    const escaped = Utils.sanitize(payload);
    expect(escaped).toBe('a&quot; onmouseover=&quot;alert(1)');
  });

  it('returns empty string for null or undefined', () => {
    expect(Utils.sanitize(null)).toBe('');
    expect(Utils.sanitize(undefined)).toBe('');
  });
});

describe('Utils.safeUrl (AUD-02 URL scheme validation)', () => {
  it('allows safe web, relative, data media, and blob schemes', () => {
    expect(Utils.safeUrl('https://example.com/path?a=1')).toBe('https://example.com/path?a=1');
    expect(Utils.safeUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(Utils.safeUrl('assets/ruma_icon_512.png')).toBe('assets/ruma_icon_512.png');
    expect(Utils.safeUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(Utils.safeUrl('blob:https://example.com/abc')).toBe('blob:https://example.com/abc');
  });

  it('rejects javascript:, data:text/html, and vbscript: payloads', () => {
    expect(Utils.safeUrl('javascript:alert(1)', '')).toBe('');
    expect(Utils.safeUrl('  JAVASCRIPT:alert(1)  ', '#')).toBe('#');
    expect(Utils.safeUrl('data:text/html,<script>alert(1)</script>', '')).toBe('');
    expect(Utils.safeUrl('vbscript:msgbox(1)', '')).toBe('');
  });
});

describe('Utils.generateGroupCode', () => {
  it('always produces a 6-character uppercase alphanumeric invitation code', () => {
    for (let i = 0; i < 30; i++) {
      const code = Utils.generateGroupCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });
});
