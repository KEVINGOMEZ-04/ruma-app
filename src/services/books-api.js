/**
 * ruma — Servicio Modular de Metadatos de Libros (BooksApi)
 *
 * Arquitectura preparada para App Móvil (Capacitor / iOS / Android):
 * - Modelo canónico normalizado con identificadores universales (isbn13, isbn10,
 *   googleBooksId, openLibraryWorkKey, openLibraryAuthorKey, appleBookId) para migrar
 *   sin pérdida de datos cuando se conecte un micro-backend (ej. Firebase Functions + Hardcover).
 * - Fase 1 (cliente): combina Google Books + Apple Books (iTunes) + Open Library
 *   (Search, Works, Ratings, Authors, Covers HD) con caché LRU en memoria.
 * - Cumple con App Store Review Guidelines 3.1.1: solo expone ficha editorial y
 *   vista previa/muestra gratuita (sin CTAs de compra digital externa).
 */

const DEFAULT_COVER = 'assets/ruma_icon_512.png';
const MAX_SEARCH_CACHE = 60;
const MAX_DETAIL_CACHE = 80;

const searchCache = new Map();
const detailCache = new Map();

function putLru(map, key, val, limit) {
  if (map.has(key)) map.delete(key);
  map.set(key, val);
  if (map.size > limit) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
}

export function normalizeBookKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cleanIsbn(raw) {
  return String(raw || '').replace(/[^0-9xX]/g, '').toUpperCase();
}

export function isIsbnQuery(raw) {
  const c = cleanIsbn(raw);
  return (c.length === 10 && /^[0-9]{9}[0-9X]$/.test(c)) || (c.length === 13 && /^(978|979)[0-9]{10}$/.test(c));
}

function stripHtml(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function upgradeGoogleCover(imageLinks) {
  if (!imageLinks) return '';
  const raw =
    imageLinks.extraLarge ||
    imageLinks.large ||
    imageLinks.medium ||
    imageLinks.small ||
    imageLinks.thumbnail ||
    imageLinks.smallThumbnail ||
    '';
  if (!raw) return '';
  return raw
    .replace(/^http:\/\//i, 'https://')
    .replace(/&edge=curl/gi, '')
    .replace(/zoom=1\b/i, 'zoom=2');
}

function upgradeAppleCover(url) {
  if (!url) return '';
  return String(url)
    .replace(/^http:\/\//i, 'https://')
    .replace(/\d+x\d+bb\.(jpg|png|webp)/i, '600x600bb.$1');
}

function normalizeLanguageCode(code) {
  const c = String(code || '').toLowerCase().trim();
  if (!c) return '';
  if (c === 'spa' || c.startsWith('es')) return 'es';
  if (c === 'eng' || c.startsWith('en')) return 'en';
  if (c === 'fra' || c === 'fre' || c.startsWith('fr')) return 'fr';
  if (c === 'por' || c.startsWith('pt')) return 'pt';
  if (c === 'ita' || c.startsWith('it')) return 'it';
  if (c === 'ger' || c === 'deu' || c.startsWith('de')) return 'de';
  return c.slice(0, 2);
}

export function formatLanguageLabel(code) {
  const map = {
    es: 'Español',
    en: 'Inglés',
    fr: 'Francés',
    pt: 'Portugués',
    it: 'Italiano',
    de: 'Alemán',
    ja: 'Japonés'
  };
  const norm = normalizeLanguageCode(code);
  return map[norm] || (norm ? norm.toUpperCase() : '');
}

/**
 * Estima tiempo de lectura en formato humano legible.
 * @param {number} pages Páginas totales o restantes
 * @param {number} pagesPerHour Ritmo personalizado o estándar (35 pág/h)
 */
export function estimateReadingTime(pages, pagesPerHour = 35) {
  const p = Number(pages || 0);
  if (p <= 0) return '';
  const pace = Math.max(10, Math.min(180, Number(pagesPerHour) || 35));
  const totalMinutes = Math.max(5, Math.round((p / pace) * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `~${m} min`;
  if (m < 5) return `~${h}h`;
  return `~${h}h ${m}m`;
}

// ============================================================================
// PROVEEDOR 1: GOOGLE BOOKS API v1
// ============================================================================
async function fetchGoogleBooks(query, { lang = 'es', max = 10, isIsbn = false } = {}) {
  try {
    const qParam = isIsbn ? `isbn:${cleanIsbn(query)}` : query;
    const langPart = !isIsbn && lang === 'es' ? '&langRestrict=es' : '';
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(qParam)}&printType=books&maxResults=${max}${langPart}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(v => {
      const info = v.volumeInfo || {};
      const access = v.accessInfo || {};
      const ids = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
      const isbn13 = ids.find(x => x.type === 'ISBN_13')?.identifier || '';
      const isbn10 = ids.find(x => x.type === 'ISBN_10')?.identifier || '';
      const cover = upgradeGoogleCover(info.imageLinks);
      const avg = Number(info.averageRating || 0);
      const count = Number(info.ratingsCount || 0);
      const hasPreview = access.viewability && access.viewability !== 'NO_PAGES';
      const previewUrl = hasPreview ? (info.previewLink || access.webReaderLink || '') : '';

      return {
        source: 'google',
        googleBooksId: v.id || '',
        title: info.title || 'Sin título',
        subtitle: info.subtitle || '',
        author: (info.authors || []).join(', ') || 'Autor desconocido',
        year: (info.publishedDate || '').slice(0, 4),
        publishedDate: info.publishedDate || '',
        pages: Number(info.pageCount || info.printedPageCount || 0),
        genres: (info.categories || []).slice(0, 3).join(', '),
        synopsis: stripHtml(info.description || ''),
        publisher: info.publisher || '',
        language: normalizeLanguageCode(info.language),
        isbn13,
        isbn10,
        poster: cover || DEFAULT_COVER,
        coverQuality: cover ? 2 : 0,
        externalRating: avg > 0 ? { score: Number((avg * 2).toFixed(1)), score5: Number(avg.toFixed(1)), count, source: 'Google Books' } : null,
        previewUrl: previewUrl ? previewUrl.replace(/^http:\/\//i, 'https://') : '',
        isPublicDomain: Boolean(access.publicDomain)
      };
    });
  } catch (_) {
    return [];
  }
}

// ============================================================================
// PROVEEDOR 2: APPLE BOOKS (iTunes Search API — portadas HD y sinopsis ES)
// ============================================================================
async function fetchAppleBooks(query, { lang = 'es', max = 8 } = {}) {
  try {
    const country = lang === 'es' ? 'es' : 'us';
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=ebook&country=${country}&limit=${max}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(item => {
      const cover = upgradeAppleCover(item.artworkUrl100 || item.artworkUrl60 || '');
      const avg = Number(item.averageUserRating || 0);
      const count = Number(item.userRatingCount || 0);
      const genres = Array.isArray(item.genres)
        ? item.genres.filter(g => g && !/^libros?$/i.test(g) && !/^books?$/i.test(g)).slice(0, 3).join(', ')
        : '';

      return {
        source: 'apple',
        appleBookId: item.trackId ? String(item.trackId) : '',
        title: item.trackName || item.collectionName || 'Sin título',
        subtitle: '',
        author: item.artistName || 'Autor desconocido',
        year: (item.releaseDate || '').slice(0, 4),
        publishedDate: (item.releaseDate || '').slice(0, 10),
        pages: 0,
        genres,
        synopsis: stripHtml(item.description || ''),
        publisher: '',
        language: lang === 'es' ? 'es' : '',
        isbn13: '',
        isbn10: '',
        poster: cover || DEFAULT_COVER,
        coverQuality: cover ? 3 : 0,
        externalRating: avg > 0 ? { score: Number((avg * 2).toFixed(1)), score5: Number(avg.toFixed(1)), count, source: 'Apple Books' } : null,
        previewUrl: '',
        isPublicDomain: false
      };
    });
  } catch (_) {
    return [];
  }
}

// ============================================================================
// PROVEEDOR 3: OPEN LIBRARY (Search + Works + Ratings + Authors + Covers -L)
// ============================================================================
const OL_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_name',
  'author_key',
  'first_publish_year',
  'number_of_pages_median',
  'subject',
  'cover_i',
  'isbn',
  'publisher',
  'language',
  'ratings_average',
  'ratings_count',
  'first_sentence'
].join(',');

function mapOpenLibraryDoc(d) {
  const isbns = Array.isArray(d.isbn) ? d.isbn : [];
  const isbn13 = isbns.find(x => String(x).length === 13) || '';
  const isbn10 = isbns.find(x => String(x).length === 10) || '';
  const cover = d.cover_i
    ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
    : (isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false` : '');
  const avg = Number(d.ratings_average || 0);
  const count = Number(d.ratings_count || 0);
  const langs = Array.isArray(d.language) ? d.language : [];
  const pickedLang = langs.includes('spa') ? 'es' : normalizeLanguageCode(langs[0] || '');
  const firstSentence = Array.isArray(d.first_sentence)
    ? d.first_sentence[0]
    : (typeof d.first_sentence === 'string' ? d.first_sentence : '');

  return {
    source: 'openlibrary',
    openLibraryWorkKey: d.key || '',
    openLibraryAuthorKey: Array.isArray(d.author_key) && d.author_key[0] ? d.author_key[0] : '',
    title: d.title || 'Sin título',
    subtitle: d.subtitle || '',
    author: (d.author_name || []).slice(0, 3).join(', ') || 'Autor desconocido',
    year: d.first_publish_year ? String(d.first_publish_year) : '',
    publishedDate: d.first_publish_year ? String(d.first_publish_year) : '',
    pages: Number(d.number_of_pages_median || 0),
    genres: (d.subject || []).filter(s => s && s.length < 32).slice(0, 3).join(', '),
    synopsis: '',
    firstSentence: stripHtml(firstSentence),
    publisher: Array.isArray(d.publisher) && d.publisher[0] ? d.publisher[0] : '',
    language: pickedLang,
    isbn13,
    isbn10,
    poster: cover || DEFAULT_COVER,
    coverQuality: d.cover_i ? 2.5 : 0,
    externalRating: avg > 0 ? { score: Number((avg * 2).toFixed(1)), score5: Number(avg.toFixed(1)), count, source: 'Open Library' } : null,
    previewUrl: d.key ? `https://openlibrary.org${d.key}` : '',
    isPublicDomain: false
  };
}

async function fetchOpenLibrary(query, { max = 10, isIsbn = false } = {}) {
  try {
    const param = isIsbn ? `isbn=${encodeURIComponent(cleanIsbn(query))}` : `q=${encodeURIComponent(query)}`;
    const url = `https://openlibrary.org/search.json?${param}&limit=${max}&fields=${OL_FIELDS}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs || []).map(mapOpenLibraryDoc);
  } catch (_) {
    return [];
  }
}

// ============================================================================
// FUSIÓN INTELIGENTE DE RESULTADOS MULTI-FUENTE
// ============================================================================
function makeMatchFingerprint(book) {
  const t = normalizeBookKey(book.title).split(' ').slice(0, 5).join(' ');
  const a = normalizeBookKey((book.author || '').split(',')[0]).split(' ').slice(-1)[0] || '';
  return `${t}|${a}`;
}

function mergeTwoBookRecords(primary, secondary) {
  if (!secondary) return primary;
  const pickCover = () => {
    const pReal = primary.poster && primary.poster !== DEFAULT_COVER;
    const sReal = secondary.poster && secondary.poster !== DEFAULT_COVER;
    if (!pReal && sReal) return { poster: secondary.poster, coverQuality: secondary.coverQuality || 1 };
    if (pReal && sReal && (secondary.coverQuality || 0) > (primary.coverQuality || 0)) {
      return { poster: secondary.poster, coverQuality: secondary.coverQuality };
    }
    return { poster: primary.poster || DEFAULT_COVER, coverQuality: primary.coverQuality || 0 };
  };

  const pickSynopsis = () => {
    const pLen = (primary.synopsis || '').length;
    const sLen = (secondary.synopsis || '').length;
    if (pLen >= 80) return primary.synopsis;
    return sLen > pLen ? secondary.synopsis : primary.synopsis;
  };

  const pickRating = () => {
    if (!primary.externalRating) return secondary.externalRating || null;
    if (!secondary.externalRating) return primary.externalRating;
    return (secondary.externalRating.count || 0) > (primary.externalRating.count || 0)
      ? secondary.externalRating
      : primary.externalRating;
  };

  const cov = pickCover();
  return {
    ...secondary,
    ...primary,
    title: primary.title || secondary.title,
    subtitle: primary.subtitle || secondary.subtitle || '',
    author: (primary.author && primary.author !== 'Autor desconocido') ? primary.author : (secondary.author || 'Autor desconocido'),
    year: primary.year || secondary.year || '',
    publishedDate: primary.publishedDate || secondary.publishedDate || '',
    pages: Number(primary.pages || 0) || Number(secondary.pages || 0),
    genres: primary.genres || secondary.genres || '',
    synopsis: pickSynopsis(),
    firstSentence: primary.firstSentence || secondary.firstSentence || '',
    publisher: primary.publisher || secondary.publisher || '',
    language: primary.language || secondary.language || '',
    isbn13: primary.isbn13 || secondary.isbn13 || '',
    isbn10: primary.isbn10 || secondary.isbn10 || '',
    googleBooksId: primary.googleBooksId || secondary.googleBooksId || '',
    openLibraryWorkKey: primary.openLibraryWorkKey || secondary.openLibraryWorkKey || '',
    openLibraryAuthorKey: primary.openLibraryAuthorKey || secondary.openLibraryAuthorKey || '',
    appleBookId: primary.appleBookId || secondary.appleBookId || '',
    poster: cov.poster,
    coverQuality: cov.coverQuality,
    externalRating: pickRating(),
    previewUrl: primary.previewUrl || secondary.previewUrl || '',
    isPublicDomain: Boolean(primary.isPublicDomain || secondary.isPublicDomain)
  };
}

function finalizeBookRecord(raw) {
  const { source: _source, coverQuality: _coverQuality, ...clean } = raw;
  return {
    ...clean,
    poster: clean.poster || DEFAULT_COVER,
    pages: Number(clean.pages || 0)
  };
}

// ============================================================================
// API PÚBLICA DEL SERVICIO
// ============================================================================
export const BooksApi = {
  isIsbnQuery,
  cleanIsbn,
  normalizeBookKey,
  formatLanguageLabel,
  estimateReadingTime,

  /**
   * Busca libros fusionando Google Books + Apple Books + Open Library.
   * Soporta búsqueda por título, autor o ISBN-10/ISBN-13.
   */
  async searchBooks(query, { lang = 'es', limit = 12 } = {}) {
    const clean = String(query || '').trim();
    if (!clean) return [];

    const isbnMode = isIsbnQuery(clean);
    const cacheKey = `${lang}|${isbnMode ? cleanIsbn(clean) : normalizeBookKey(clean)}`;
    if (searchCache.has(cacheKey)) {
      return searchCache.get(cacheKey);
    }

    const [gbRes, appleRes, olRes] = await Promise.allSettled([
      fetchGoogleBooks(clean, { lang, max: 10, isIsbn: isbnMode }),
      isbnMode ? Promise.resolve([]) : fetchAppleBooks(clean, { lang, max: 8 }),
      fetchOpenLibrary(clean, { max: 10, isIsbn: isbnMode })
    ]);

    let gbItems = gbRes.status === 'fulfilled' ? gbRes.value : [];
    const appleItems = appleRes.status === 'fulfilled' ? appleRes.value : [];
    const olItems = olRes.status === 'fulfilled' ? olRes.value : [];

    // Si en español Google Books devolvió muy pocos resultados, hacer fallback global
    if (!isbnMode && lang === 'es' && gbItems.length < 3 && appleItems.length < 2) {
      const gbGlobal = await fetchGoogleBooks(clean, { lang: 'all', max: 8, isIsbn: false });
      gbItems = [...gbItems, ...gbGlobal];
    }

    // Orden de prioridad: Google Books (mejor metadato editorial + ISBN + páginas) -> Apple Books (HD + sinopsis ES) -> Open Library (ratings + obras)
    const combined = [...gbItems, ...appleItems, ...olItems];
    const mergedMap = new Map();

    combined.forEach(item => {
      if (!item?.title) return;
      // Primero intentar emparejar por ISBN-13 si existe
      let existingKey = null;
      if (item.isbn13) {
        for (const [k, v] of mergedMap.entries()) {
          if (v.isbn13 && v.isbn13 === item.isbn13) {
            existingKey = k;
            break;
          }
        }
      }
      const fp = makeMatchFingerprint(item);
      if (!existingKey && mergedMap.has(fp)) {
        existingKey = fp;
      } else if (!existingKey) {
        const titleNorm = normalizeBookKey(item.title);
        for (const [k, v] of mergedMap.entries()) {
          const vTitle = normalizeBookKey(v.title);
          const sameAuthor = normalizeBookKey((v.author || '').split(',')[0]) === normalizeBookKey((item.author || '').split(',')[0]);
          if (sameAuthor && vTitle && titleNorm && (vTitle === titleNorm || (titleNorm.length > 6 && (vTitle.includes(titleNorm) || titleNorm.includes(vTitle))))) {
            existingKey = k;
            break;
          }
        }
      }

      if (existingKey) {
        mergedMap.set(existingKey, mergeTwoBookRecords(mergedMap.get(existingKey), item));
      } else {
        mergedMap.set(fp, item);
      }
    });

    // Puntuar relevancia/completitud para poner las fichas más ricas arriba
    const scoreItem = (b) => {
      let s = 0;
      if (b.poster && b.poster !== DEFAULT_COVER) s += (b.coverQuality || 1) * 3;
      if (b.synopsis && b.synopsis.length > 60) s += 4;
      if (b.pages > 0) s += 3;
      if (b.externalRating) s += 2;
      if (b.isbn13) s += 1.5;
      if (lang === 'es' && b.language === 'es') s += 3.5;
      return s;
    };

    const out = Array.from(mergedMap.values())
      .sort((a, b) => scoreItem(b) - scoreItem(a))
      .slice(0, limit)
      .map(finalizeBookRecord);

    putLru(searchCache, cacheKey, out, MAX_SEARCH_CACHE);
    return out;
  },

  /**
   * Hidrata metadatos faltantes de un libro ya guardado en la biblioteca del grupo.
   */
  async hydrateBookPatch(book) {
    if (!book?.title) return null;
    const authorFirst = book.author && book.author !== 'Autor desconocido' ? book.author.split(',')[0].trim() : '';
    const q = book.isbn13 || `${book.title} ${authorFirst}`.trim();
    const candidates = await this.searchBooks(q, { lang: book.language || 'es', limit: 6 });
    if (!candidates.length) return null;

    const targetKey = normalizeBookKey(book.title);
    const matched = candidates.find(c => {
      const ck = normalizeBookKey(c.title);
      return ck === targetKey || ck.includes(targetKey) || targetKey.includes(ck);
    }) || candidates[0];

    const patch = {};
    if (!Number(book.pages || 0) && matched.pages > 0) patch.pages = matched.pages;
    if (!book.genres && matched.genres) patch.genres = matched.genres;
    if (!book.year && matched.year) patch.year = matched.year;
    if (!book.synopsis && matched.synopsis) patch.synopsis = matched.synopsis;
    if (!book.publisher && matched.publisher) patch.publisher = matched.publisher;
    if (!book.isbn13 && matched.isbn13) patch.isbn13 = matched.isbn13;
    if (!book.isbn10 && matched.isbn10) patch.isbn10 = matched.isbn10;
    if (!book.language && matched.language) patch.language = matched.language;
    if (!book.externalRating && matched.externalRating) patch.externalRating = matched.externalRating;
    if (!book.previewUrl && matched.previewUrl) patch.previewUrl = matched.previewUrl;
    if (!book.openLibraryWorkKey && matched.openLibraryWorkKey) patch.openLibraryWorkKey = matched.openLibraryWorkKey;
    if (!book.openLibraryAuthorKey && matched.openLibraryAuthorKey) patch.openLibraryAuthorKey = matched.openLibraryAuthorKey;
    if (!book.googleBooksId && matched.googleBooksId) patch.googleBooksId = matched.googleBooksId;
    if (!book.appleBookId && matched.appleBookId) patch.appleBookId = matched.appleBookId;
    if ((!book.poster || book.poster === DEFAULT_COVER) && matched.poster && matched.poster !== DEFAULT_COVER) {
      patch.poster = matched.poster;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  },

  /**
   * Obtiene información enriquecida bajo demanda para la ficha detallada del libro:
   * - Sinopsis ampliada, personajes, lugares y temas (Open Library Works)
   * - Rating comunitario actualizado
   * - Biografía y foto del autor (Open Library Authors + Wikipedia ES como apoyo)
   * - Otros libros del mismo autor ("Más de este autor")
   */
  async getBookEnrichment(book) {
    if (!book?.title) return null;
    const cacheKey = book.id || book.openLibraryWorkKey || book.isbn13 || normalizeBookKey(book.title);
    if (detailCache.has(cacheKey)) return detailCache.get(cacheKey);

    let workKey = book.openLibraryWorkKey || '';
    let authorKey = book.openLibraryAuthorKey || '';
    const primaryAuthor = (book.author || '').split(',')[0].trim();

    // Resolver workKey/authorKey si el libro es antiguo o fue agregado manualmente
    if (!workKey && !authorKey) {
      const q = book.isbn13 || `${book.title} ${primaryAuthor !== 'Autor desconocido' ? primaryAuthor : ''}`.trim();
      const olMatches = await fetchOpenLibrary(q, { max: 4, isIsbn: Boolean(book.isbn13) });
      const targetKey = normalizeBookKey(book.title);
      const hit = olMatches.find(m => normalizeBookKey(m.title) === targetKey) || olMatches[0];
      if (hit) {
        workKey = hit.openLibraryWorkKey || '';
        authorKey = hit.openLibraryAuthorKey || '';
      }
    }

    const tasks = {
      work: workKey
        ? fetch(`https://openlibrary.org${workKey}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      ratings: workKey
        ? fetch(`https://openlibrary.org${workKey}/ratings.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      author: authorKey
        ? fetch(`https://openlibrary.org/authors/${authorKey}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      wikiAuthor: (primaryAuthor && primaryAuthor !== 'Autor desconocido')
        ? fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(primaryAuthor.replace(/\s+/g, '_'))}`)
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
      moreByAuthor: (primaryAuthor && primaryAuthor !== 'Autor desconocido')
        ? fetch(`https://openlibrary.org/search.json?author=${encodeURIComponent(primaryAuthor)}&limit=10&fields=${OL_FIELDS}`)
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null)
    };

    const [workData, ratingData, authorData, wikiData, moreData] = await Promise.all([
      tasks.work,
      tasks.ratings,
      tasks.author,
      tasks.wikiAuthor,
      tasks.moreByAuthor
    ]);

    const extractText = (val) => {
      if (!val) return '';
      if (typeof val === 'string') return stripHtml(val);
      if (typeof val === 'object' && val.value) return stripHtml(val.value);
      return '';
    };

    const workDescription = extractText(workData?.description);
    const subjects = (workData?.subjects || []).filter(s => s && s.length < 34).slice(0, 8);
    const subjectPlaces = (workData?.subject_places || []).slice(0, 5);
    const subjectPeople = (workData?.subject_people || []).slice(0, 5);

    const olAvg = Number(ratingData?.summary?.average || 0);
    const olCount = Number(ratingData?.summary?.count || 0);
    const communityRating = olAvg > 0
      ? { score: Number((olAvg * 2).toFixed(1)), score5: Number(olAvg.toFixed(1)), count: olCount, source: 'Open Library' }
      : (book.externalRating || null);

    // Biografía del autor: priorizar Wikipedia en español (mucho más clara para usuarios hispanohablantes) con respaldo de Open Library
    const wikiBio = wikiData && wikiData.type === 'standard' && wikiData.extract ? stripHtml(wikiData.extract) : '';
    const olBio = extractText(authorData?.bio);
    const authorBio = wikiBio || olBio || '';
    const authorPhoto =
      wikiData?.thumbnail?.source ||
      (authorKey ? `https://covers.openlibrary.org/a/olid/${authorKey}-M.jpg?default=false` : '');

    // Otros libros del mismo autor (excluyendo el libro actual y duplicados)
    const currentKey = normalizeBookKey(book.title);
    const seenMore = new Set([currentKey]);
    const moreBooks = [];
    (moreData?.docs || []).forEach(doc => {
      const mapped = mapOpenLibraryDoc(doc);
      const mk = normalizeBookKey(mapped.title);
      if (!mk || seenMore.has(mk) || mk.includes(currentKey) || currentKey.includes(mk)) return;
      if (mapped.poster === DEFAULT_COVER) return;
      seenMore.add(mk);
      moreBooks.push(finalizeBookRecord(mapped));
    });

    const enrichment = {
      workKey,
      authorKey,
      workDescription,
      subjects,
      subjectPlaces,
      subjectPeople,
      communityRating,
      author: primaryAuthor && primaryAuthor !== 'Autor desconocido'
        ? {
            name: primaryAuthor,
            bio: authorBio.slice(0, 520),
            photo: authorPhoto,
            birthDate: authorData?.birth_date || ''
          }
        : null,
      moreBooks: moreBooks.slice(0, 6)
    };

    putLru(detailCache, cacheKey, enrichment, MAX_DETAIL_CACHE);
    return enrichment;
  }
};
