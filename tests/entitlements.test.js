import { describe, it, expect } from 'vitest';
import { Entitlements } from '../src/core/entitlements.js';

describe('Entitlements Freemium locks & strict transitivity (AUD-05)', () => {
  it('locks only items beyond 5 for Free groups across movies, series, songs, and books', () => {
    const makeItems = (prefix) => [
      { id: `${prefix}6`, createdAt: '2026-06-01T00:00:00Z' },
      { id: `${prefix}5`, createdAt: '2026-05-01T00:00:00Z' },
      { id: `${prefix}4`, createdAt: '2026-04-01T00:00:00Z' },
      { id: `${prefix}3`, createdAt: '2026-03-01T00:00:00Z' },
      { id: `${prefix}2`, createdAt: '2026-02-01T00:00:00Z' },
      { id: `${prefix}1`, createdAt: '2026-01-01T00:00:00Z' }
    ];

    const freeGroup = {
      id: 'g1',
      plan: 'free',
      movies: makeItems('m'),
      series: makeItems('s'),
      songs: makeItems('k'),
      books: makeItems('b')
    };

    for (const [cat, p] of [['movies', 'm'], ['series', 's'], ['songs', 'k'], ['books', 'b']]) {
      const locked = Entitlements.getLockedMediaIds(freeGroup, cat);
      expect(locked.size).toBe(1);
      expect(locked.has(`${p}6`)).toBe(true);
      expect(Entitlements.isMediaItemLocked(freeGroup, cat, `${p}6`)).toBe(true);
      expect(Entitlements.isMediaItemLocked(freeGroup, cat, `${p}1`)).toBe(false);
    }

    const premGroup = { ...freeGroup, plan: 'premium' };
    expect(Entitlements.getLockedMediaIds(premGroup, 'movies').size).toBe(0);
    expect(Entitlements.isMediaItemLocked(premGroup, 'movies', 'm6')).toBe(false);
  });

  it('produces deterministic, order-independent locks when mixing legacy items without createdAt and timestamped items', () => {
    const items = [
      { id: 'newest', createdAt: '2026-05-01T00:00:00Z' },
      { id: 'legacy_a' },
      { id: 'mid', createdAt: '2026-02-01T00:00:00Z' },
      { id: 'legacy_b' },
      { id: 'old_ts', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'newer', createdAt: '2026-04-01T00:00:00Z' },
      { id: 'mid2', createdAt: '2026-03-01T00:00:00Z' }
    ];

    const group = { id: 'g1', plan: 'free', movies: items };
    const locked = Entitlements.getLockedMediaIds(group, 'movies');

    // Legacy items (no createdAt) are treated as oldest, followed by earliest timestamps;
    // the 2 most recent timestamped items ('newer' and 'newest') must be locked.
    expect(locked.size).toBe(2);
    expect(locked.has('newest')).toBe(true);
    expect(locked.has('newer')).toBe(true);
    expect(locked.has('legacy_a')).toBe(false);
    expect(locked.has('legacy_b')).toBe(false);
  });

  it('keeps creator groups unlocked first and handles mixed timestamps transitively in getLockedGroupIds', () => {
    const user = { id: 'u1', isPremium: false };
    const groups = [
      { id: 'inv_new', creatorId: 'u2', createdAt: '2026-05-01T00:00:00Z', members: [{ id: 'u1', joinedAt: '2026-05-02T00:00:00Z' }] },
      { id: 'inv_legacy', creatorId: 'u3', members: [{ id: 'u1' }] },
      { id: 'inv_old', creatorId: 'u4', createdAt: '2026-01-01T00:00:00Z', members: [{ id: 'u1', joinedAt: '2026-01-02T00:00:00Z' }] },
      { id: 'mine', creatorId: 'u1', createdAt: '2026-06-01T00:00:00Z', members: [{ id: 'u1', joinedAt: '2026-06-01T00:00:00Z' }] }
    ];

    const locked = Entitlements.getLockedGroupIds(user, groups);
    expect(locked.has('mine')).toBe(false);
    expect(locked.has('inv_legacy')).toBe(false);
    expect(locked.has('inv_old')).toBe(true);
    expect(locked.has('inv_new')).toBe(true);
  });
});
