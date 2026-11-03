// ── Dates des notes ───────────────────────────────────────────────────────────
// Logique pure (ni DOM ni Firebase) partagée par app.js et les scripts console.
// Chaque note est { critic, score, comment, date } ; `date` est au format
// JJ/MM/AAAA comme `date_ajout`, et une date vide signifie « note historique ».

const pad = n => String(n).padStart(2, '0');
const DAY_MS = 24 * 60 * 60 * 1000;

// Date locale à minuit — jamais new Date('AAAA-MM-JJ'), qui est lu en UTC.
function makeDate(y, m, d) {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function parseFrDate(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str ?? '').trim());
  return m ? makeDate(+m[3], +m[2], +m[1]) : null;
}

const formatFr = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

// Conversions pour <input type="date"> (valeur AAAA-MM-JJ)
export function isoToFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  const d = m && makeDate(+m[1], +m[2], +m[3]);
  return d ? formatFr(d) : '';
}

export function frToIso(fr) {
  const d = parseFrDate(fr);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
}

export function todayFr(now = new Date()) {
  return formatFr(now);
}

export function cleanNote(n) {
  const str = v => String(v ?? '').trim();
  const date = str(n.date);
  return { critic: str(n.critic), score: str(n.score), comment: str(n.comment), date: parseFrDate(date) ? date : '' };
}

export function latestNoteDate(notes) {
  let best = null;
  (notes || []).forEach(n => {
    const d = parseFrDate(n?.date);
    if (d && (!best || d > best)) best = d;
  });
  return best ? formatFr(best) : '';
}

// Nouvelle si datée d'au plus `days` jours (les dates futures comptent comme nouvelles)
export function isNewNote(note, now = new Date(), days = 90) {
  const d = parseFrDate(note?.date);
  if (!d) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - d) / DAY_MS) <= days;
}

// Une entrée par note datée, de la plus récente à la plus ancienne (tri stable)
export function datedNoteEntries(wines) {
  const entries = [];
  (wines || []).forEach(wine => {
    (wine._notes || []).forEach(note => {
      const date = parseFrDate(note.date);
      if (date) entries.push({ wine, note, date });
    });
  });
  return entries.sort((a, b) => b.date - a.date);
}

// month : 1-12, ou null pour toute l'année
export function filterByPeriod(entries, year, month) {
  return entries.filter(e => e.date.getFullYear() === year && (month == null || e.date.getMonth() + 1 === month));
}

export function yearsWithNotes(entries, now = new Date()) {
  const years = new Set([now.getFullYear(), ...entries.map(e => e.date.getFullYear())]);
  return [...years].sort((a, b) => b - a);
}

export function monthsWithNotes(entries, year) {
  return new Set(entries.filter(e => e.date.getFullYear() === year).map(e => e.date.getMonth() + 1));
}

// Fiche vin : notes datées (récentes d'abord), puis notes historiques dans
// l'ordre de classement fourni, puis le reste dans l'ordre d'origine.
export function orderNotesForModal(notes, rankedCritics) {
  const dated = notes.filter(n => parseFrDate(n.date)).sort((a, b) => parseFrDate(b.date) - parseFrDate(a.date));
  const undated = notes.filter(n => !parseFrDate(n.date));
  const rank = c => { const i = rankedCritics.indexOf(c); return i === -1 ? Infinity : i; };
  const ranked = undated.map((n, i) => ({ n, i })).sort((a, b) => (rank(a.n.critic) - rank(b.n.critic)) || (a.i - b.i));
  return [...dated, ...ranked.map(x => x.n)];
}

export function noteCopyLine(wine, note, abbrev) {
  const domaine = (wine['Domaine ou Marque'] || '').trim().toUpperCase();
  const nom = (wine['Nom du vin'] || '').trim();
  const mil = (wine['Millésime'] || '').trim();
  return `${domaine} - ${nom} ${mil} : ${abbrev} ${(note.score || '').trim()}`;
}

// Règle de rattrapage : une fiche datée (date_ajout) sans aucune note datée
// reporte sa date sur sa dernière note. Renvoie une copie, sans muter l'entrée.
// Utilisée par le script de rattrapage ET par le formulaire admin, pour qu'un
// enregistrement fait avant le rattrapage ne perde pas la date de la fiche.
const needsLegacyDate = (notes, dateAjout) =>
  !!parseFrDate(dateAjout) && notes.length > 0 && !notes.some(n => parseFrDate(n.date));

export function datedFromLegacy(notes, dateAjout) {
  const copy = (notes || []).map(n => ({ ...n }));
  if (needsLegacyDate(copy, dateAjout)) copy[copy.length - 1].date = dateAjout.trim();
  return copy;
}

export function planBackfill(docs) {
  return docs
    .filter(d => needsLegacyDate(d.notes || [], d.date_ajout))
    .map(d => ({ id: d.id, notes: datedFromLegacy(d.notes, d.date_ajout) }));
}
