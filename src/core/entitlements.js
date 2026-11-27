/**
 * ruma 🌟 — Motor Centralizado de Reglas Freemium (Entitlements Engine)
 *
 * Reglas de negocio oficiales:
 * - Plan Gratis:
 *   * Puede pertenecer a máximo 2 grupos (1 creado como Host + 1 unido como Miembro).
 *   * La única forma de obtener Premium es creando un Grupo Premium (o mejorando su grupo creado).
 *   * Recuerdos en Google Drive: sin límite de peso (almacenado en el Drive del grupo en carpetas [Título - Fecha]),
 *     con límite cómodo de archivos por subida simultánea (10).
 *   * Entretenimiento en Grupo Gratis: máximo 5 películas, 5 series y 5 canciones guardadas.
 * - Plan Premium (Grupo ruma Plus):
 *   * Puede crear 1 Grupo Premium y pertenecer a múltiples grupos como miembro.
 *   * Películas, series y canciones ilimitadas.
 *   * Más personalización (marcos exclusivos estilo Discord, temas y colores).
 */

export const PLAN_LIMITS = {
  free: {
    maxCreatedGroups: 1,
    maxJoinedGroups: 1,
    maxTotalGroups: 2,
    maxMoviesPerGroup: 5,
    maxSeriesPerGroup: 5,
    maxSongsPerGroup: 5,
    maxBooksPerGroup: 5,
    maxFilesPerMemoryUpload: 10, // Sin límite de MB/GB porque va a Google Drive
    customThemes: false,
    premiumFrames: false
  },
  premium: {
    maxCreatedGroups: 1,         // 1 Grupo Premium creado
    maxJoinedGroups: Infinity,   // Sin límite de grupos a los que se une
    maxTotalGroups: Infinity,
    maxMoviesPerGroup: Infinity,
    maxSeriesPerGroup: Infinity,
    maxSongsPerGroup: Infinity,
    maxBooksPerGroup: Infinity,
    maxFilesPerMemoryUpload: 50,
    customThemes: true,
    premiumFrames: true
  }
};

export const Entitlements = {
  /**
   * Determina si un usuario tiene beneficios Premium (si creó un grupo Premium o activó ruma Plus)
   */
  isUserPremium(user, allGroups = []) {
    if (!user) return false;
    if (user.isPremium) return true;
    return allGroups.some(g => g.creatorId === user.id && g.plan === 'premium');
  },

  /**
   * Determina si un grupo específico es Premium
   */
  isGroupPremium(group) {
    return Boolean(group && group.plan === 'premium');
  },

  /**
   * Obtiene los límites aplicables a un usuario para creación/unión de grupos
   */
  getUserLimits(user, allGroups = []) {
    return this.isUserPremium(user, allGroups) ? PLAN_LIMITS.premium : PLAN_LIMITS.free;
  },

  /**
   * Obtiene los límites aplicables a un grupo específico (Cine, Series, Música, Recuerdos)
   */
  getGroupLimits(group) {
    return this.isGroupPremium(group) ? PLAN_LIMITS.premium : PLAN_LIMITS.free;
  },

  /**
   * Valida si el usuario puede crear un nuevo grupo
   */
  canCreateGroup(user, allGroups = [], targetPlan = 'free') {
    if (!user) return { allowed: false, reason: 'Debes iniciar sesión.' };
    const createdByMe = allGroups.filter(g => g.creatorId === user.id);
    const myGroups = allGroups.filter(g => (g.members || []).some(m => m.id === user.id));

    if (createdByMe.length >= 1) {
      return {
        allowed: false,
        reason: 'Cada cuenta puede ser creadora de 1 grupo propio. Puedes mejorar tu grupo actual a Premium 🌟.'
      };
    }

    const isPrem = targetPlan === 'premium' || this.isUserPremium(user, allGroups);
    if (!isPrem && myGroups.length >= PLAN_LIMITS.free.maxTotalGroups) {
      return {
        allowed: false,
        reason: 'En el Plan Gratis puedes pertenecer a máximo 2 grupos. Crea un Grupo Premium para ampliar tu límite.'
      };
    }

    return { allowed: true };
  },

  /**
   * Valida si el usuario puede unirse a otro grupo como miembro
   */
  canJoinGroup(user, allGroups = []) {
    if (!user) return { allowed: false, reason: 'Debes iniciar sesión.' };
    const isPrem = this.isUserPremium(user, allGroups);
    if (isPrem) return { allowed: true };

    const myGroups = allGroups.filter(g => (g.members || []).some(m => m.id === user.id));
    const joinedAsMember = myGroups.filter(g => g.creatorId !== user.id);

    if (myGroups.length >= PLAN_LIMITS.free.maxTotalGroups) {
      return {
        allowed: false,
        reason: 'Has alcanzado el límite de 2 grupos del Plan Gratis (1 creado y 1 unido). Crea o mejora tu grupo a Premium ✨ para unirte a más grupos.'
      };
    }

    if (joinedAsMember.length >= PLAN_LIMITS.free.maxJoinedGroups) {
      return {
        allowed: false,
        reason: 'En el Plan Gratis puedes unirte a 1 grupo como invitado y crear 1 grupo propio. Pásate a Premium para unirte a todos los que quieras.'
      };
    }

    return { allowed: true };
  },

  /**
   * Valida si se puede guardar una película, serie o canción en el grupo
   * @param {Object} group
   * @param {'movies'|'series'|'songs'} category
   */
  canAddMediaItem(group, category) {
    if (!group) return { allowed: false, current: 0, max: 5 };
    const limits = this.getGroupLimits(group);
    const mapMax = {
      movies: limits.maxMoviesPerGroup,
      series: limits.maxSeriesPerGroup,
      songs: limits.maxSongsPerGroup,
      books: limits.maxBooksPerGroup
    };
    const labelMap = {
      movies: 'películas',
      series: 'series',
      songs: 'canciones',
      books: 'libros'
    };

    const currentList = group[category] || [];
    const max = mapMax[category] ?? 5;

    if (currentList.length >= max) {
      return {
        allowed: false,
        current: currentList.length,
        max,
        reason: `Este grupo Gratis alcanzó el límite de ${max} ${labelMap[category]} guardadas. Mejora el grupo a ruma Plus ✨ para guardar ${labelMap[category]} ilimitadas.`
      };
    }

    return {
      allowed: true,
      current: currentList.length,
      max
    };
  },

  /**
   * Verifica si un miembro es el Creador principal del grupo (propietario de la carpeta Ruma 🌷 en Google Drive)
   */
  isGroupCreator(group, userId) {
    if (!group || !userId) return false;
    return group.creatorId === userId;
  },

  /**
   * Verifica si un miembro tiene rango Administrador en el grupo
   */
  isGroupAdmin(group, userId) {
    if (!group || !userId) return false;
    if (group.creatorId === userId) return true;
    const member = (group.members || []).find(m => m.id === userId);
    return Boolean(member && member.role === 'admin');
  },

  /**
   * Devuelve un Set con los IDs de grupos bloqueados para el usuario por exceso del límite Freemium (máx 2 grupos).
   * Se conserva el grupo creado por el usuario y el más antiguo al que se unió; se bloquean los más recientes ingresados.
   */
  getLockedGroupIds(user, allGroups = []) {
    const locked = new Set();
    if (!user || this.isUserPremium(user, allGroups)) return locked;

    const myGroups = allGroups.filter(g => (g.members || []).some(m => m.id === user.id));
    const maxAllowed = PLAN_LIMITS.free.maxTotalGroups;
    if (myGroups.length <= maxAllowed) return locked;

    const withMeta = myGroups.map((g, idx) => {
      const me = (g.members || []).find(m => m.id === user.id);
      const isCreator = g.creatorId === user.id;
      const ts = me?.joinedAt || g.createdAt || '';
      return { g, idx, isCreator, ts };
    });

    // Prioridad para conservar (orden total estricto y transitivo):
    // 1) grupos creados por el usuario, 2) legacy sin timestamp antes que recientes con timestamp,
    // 3) timestamp más antiguo, 4) índice menor.
    const ordered = [...withMeta].sort((a, b) => {
      if (a.isCreator !== b.isCreator) return a.isCreator ? -1 : 1;
      const aHasTs = Boolean(a.ts);
      const bHasTs = Boolean(b.ts);
      if (aHasTs !== bHasTs) return aHasTs ? 1 : -1;
      if (aHasTs && a.ts !== b.ts) return a.ts.localeCompare(b.ts);
      return a.idx - b.idx;
    });

    ordered.slice(maxAllowed).forEach(entry => locked.add(entry.g.id));
    return locked;
  },

  /**
   * Devuelve un Set con los IDs de ítems bloqueados (movies | series | songs | books) en un grupo Free cuando exceden 5.
   * Conserva los 5 más antiguos y bloquea los más recientes agregados.
   */
  getLockedMediaIds(group, category) {
    const locked = new Set();
    if (!group || this.isGroupPremium(group)) return locked;
    const list = group[category] || [];
    const maxMap = {
      movies: PLAN_LIMITS.free.maxMoviesPerGroup,
      series: PLAN_LIMITS.free.maxSeriesPerGroup,
      songs: PLAN_LIMITS.free.maxSongsPerGroup,
      books: PLAN_LIMITS.free.maxBooksPerGroup
    };
    const max = maxMap[category] ?? 5;
    if (list.length <= max) return locked;

    // addMediaToActiveGroup usa unshift (nuevos al inicio), así que los legacy sin createdAt son los más antiguos (mayor idx).
    // Tupla totalmente ordenada (transitiva): (hasTs, ts, -idx)
    const orderedOldestFirst = list.map((item, idx) => ({
      item,
      idx,
      ts: item?.createdAt || ''
    })).sort((a, b) => {
      const aHasTs = Boolean(a.ts);
      const bHasTs = Boolean(b.ts);
      if (aHasTs !== bHasTs) return aHasTs ? 1 : -1;
      if (aHasTs && a.ts !== b.ts) return a.ts.localeCompare(b.ts);
      return b.idx - a.idx;
    });

    orderedOldestFirst.slice(max).forEach(e => locked.add(e.item.id));
    return locked;
  },

  /**
   * Indica si un elemento específico está bloqueado por límites del Plan Free.
   */
  isMediaItemLocked(group, category, itemId) {
    if (!group || !itemId) return false;
    return this.getLockedMediaIds(group, category).has(itemId);
  }
};
