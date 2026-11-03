// ── Cache local des fiches ────────────────────────────────────────────────────
// Le quota gratuit Firestore est de 50 000 lectures par jour, et lire toutes les
// fiches coûte une lecture par fiche. Le site garde donc une copie des fiches
// dans le navigateur, valable tant que le numéro de version de config/site
// (champ `winesVersion`) n'a pas changé, et au plus WINES_CACHE_TTL_MS.
// Toute écriture dans `wines` (admin, scripts console) doit changer ce numéro.
// Logique pure : le stockage est passé en paramètre (localStorage dans le site).

export const WINES_CACHE_KEY = 'wat:wines-cache:v1';
export const WINES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Version absente (base jamais modifiée depuis la mise en place du cache) : '0'
export function winesVersionOf(siteConfig) {
  const v = siteConfig?.winesVersion;
  return v == null || v === '' ? '0' : String(v);
}

export function newWinesVersion(now = Date.now()) {
  return `${now}-${Math.random().toString(36).slice(2, 8)}`;
}

// docs : [{ id, data }] tels que lus dans Firestore. Renvoie null si inutilisable.
export function readWinesCache(storage, version, now = Date.now()) {
  try {
    const cache = JSON.parse(storage?.getItem(WINES_CACHE_KEY) ?? 'null');
    if (!cache || cache.version !== version || !Array.isArray(cache.docs)) return null;
    const age = now - cache.savedAt;
    return age >= 0 && age < WINES_CACHE_TTL_MS ? cache.docs : null;
  } catch {
    return null;
  }
}

export function writeWinesCache(storage, version, docs, now = Date.now()) {
  try {
    if (!storage) return false;
    storage.setItem(WINES_CACHE_KEY, JSON.stringify({ version, savedAt: now, docs }));
    return true;
  } catch {
    return false; // stockage plein ou bloqué : le site marche sans cache
  }
}

export function clearWinesCache(storage) {
  try { storage?.removeItem(WINES_CACHE_KEY); } catch { /* stockage bloqué : rien à effacer */ }
}
