import { db, auth } from './firebase-config.js';
import {
  cleanNote, latestNoteDate, todayFr, isoToFr, frToIso, parseFrDate, isNewNote,
  orderNotesForModal, datedNoteEntries, filterByPeriod, yearsWithNotes, monthsWithNotes,
  noteCopyLine, datedFromLegacy,
} from './notes-utils.js';
import {
  collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const ADMIN_EMAIL = 'admin@wine-awards-lurton.internal';

// ── Admin : toggle stock feature ──────────────────────────────────────────────
let stockFeatureEnabled = true; // valeur provisoire, écrasée par Firestore au démarrage
let isAdmin = false;
let openAdminEditForm = null;

function applyStockFeature() {
  const section = document.getElementById('filterAvailSection');
  if (section) section.style.display = stockFeatureEnabled ? '' : 'none';
  // Reset avail filter when hidden to avoid locked state
  if (!stockFeatureEnabled) {
    state.filters.avail.clear();
  }
  renderGrid();
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CRITIC_ABBREV = {
  'Wine Spectator': 'WS', 'Wine Enthusiast': 'WE', 'Wine Advocate': 'WA',
  'Wine & Spirits': 'W&S', 'Vinous': 'V', 'James Suckling': 'JS',
  'Wine Align': 'WAlign', 'Jeb Dunnuck': 'JD', 'Miquel Hudin': 'MH',
  'TASTED Andreas Larson': 'AL', 'Decanter': 'Dec', 'IWC': 'IWC',
  'IWSC': 'IWSC', 'Tim Atkin': 'TA', 'Jancis Robinson': 'JR',
  'Wine Merchant Magazine': 'WMM', 'Wine Anorak': 'WAn', 'Harpers': 'Harp',
  'Sommelier Edit Awards (Via CIVR)': 'SEA', 'Drinks Business': 'DB',
  'Gourmets': 'Gour', 'Guia Penin': 'GP', 'RVF': 'RVF', 'Le Point': 'LP',
  'Terre de Vins': 'TdV', 'Anivin': 'Ani', 'Mondial Grenache': 'M.Gren',
  'Mondial SB': 'M.SB', 'Gilbert & Gaillard': 'G&G', 'Sud-Ouest': 'SO',
  'Concours de Bruxelles': 'CdB', 'Académie des Vins et de la Gastronomie': 'AVG',
  'Concours Général Agricole de Paris': 'CGAP', 'Concours IGP': 'IGP',
  'Bettane & Desseauve': 'B&D', 'PARIS INTERNATIONAL TROPHY': 'PIT',
  'GILBERT & GAILLARD (gold entre 87 et 89 / dble gold à partir 90)': 'G&G',
  'Falstaff': 'Fal', 'Yves Beck': 'YB', 'Mundus vini': 'MV',
  'Descorchados': 'Desc', 'Vinomanos': 'VM', 'la CAV': 'CAV',
  'Tatler HK': 'THK', 'Jeannie Cho Lee MW': 'JCL', 'Sakura Wine Awards': 'SAK',
};

const COUNTRY_CODE = { 'france': 'FR', 'argentine': 'AR', 'espagne': 'ES', 'chili': 'CL' };
const COUNTRY_FLAG = { 'france': '🇫🇷', 'argentine': '🇦🇷', 'espagne': '🇪🇸', 'chili': '🇨🇱' };
const ICON_PENCIL_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3.114 1.04 1.04-3.114a4 4 0 01.94-1.414z"/></svg>';

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  fr: {
    searchPlaceholder: 'Rechercher un vin, domaine, critique, note…',
    pays: 'Pays',
    disponibilite: 'Disponibilité',
    couleur: 'Couleur',
    domaine: 'Domaine',
    scoreMin: 'Score minimum',
    tous: 'Tous',
    enStock: 'En stock',
    epuise: 'Épuisé',
    dernieresNotes: 'Dernières notes reçues',
    vinsSelectionnes: n => `${n} vin${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''} pour l'envoi`,
    copier: 'Copier',
    copierNotes: 'Copier les notes',
    modifier: 'Modifier',
    trierPar: 'Trier par',
    meilleurScore: 'Meilleur score',
    nomAZ: 'Nom A–Z',
    domaineAZ: 'Domaine A–Z',
    millesime: 'Millésime ↓',
    vinsTotal: n => `${n} vin${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}`,
    chargement: 'Chargement…',
    aucunVin: 'Aucun vin ne correspond aux filtres.',
    voirPlus: n => `Voir plus (${n} restants)`,
    aucuneNote: 'Aucune note',
    notesCritiques: 'Notes des critiques',
    copie: 'Copié dans le presse-papiers',
    vignettes: 'Vignettes',
    liste: 'Liste',
    nouveau: 'Nouveau',
    toutVoir: 'Tout voir →',
    nouvellesNotes: 'Nouvelles notes',
    retourCatalogue: '← Retour au catalogue',
    tousMois: 'Tous',
    annee: 'Année',
    aucuneNouvelleNote: 'Aucune nouvelle note sur cette période.',
    nbNotes: (n, periode) => `${n} note${n > 1 ? 's' : ''} · ${periode}`,
    copierLaNote: 'Copier cette note',
    countries: { france: 'France', argentine: 'Argentine', espagne: 'Espagne', chili: 'Chili' },
    colors: { rouge: 'Rouge', blanc: 'Blanc', 'rosé': 'Rosé', rose: 'Rosé', autre: 'Autre' },
  },
  en: {
    searchPlaceholder: 'Search wine, estate, critic, score…',
    pays: 'Country',
    disponibilite: 'Availability',
    couleur: 'Colour',
    domaine: 'Estate',
    scoreMin: 'Min. score',
    tous: 'All',
    enStock: 'In stock',
    epuise: 'Out of stock',
    dernieresNotes: 'Latest scores',
    vinsSelectionnes: n => `${n} wine${n > 1 ? 's' : ''} selected`,
    copier: 'Copy',
    copierNotes: 'Copy scores',
    modifier: 'Edit',
    trierPar: 'Sort by',
    meilleurScore: 'Best score',
    nomAZ: 'Name A–Z',
    domaineAZ: 'Estate A–Z',
    millesime: 'Vintage ↓',
    vinsTotal: n => `${n} wine${n > 1 ? 's' : ''} found`,
    chargement: 'Loading…',
    aucunVin: 'No wines match the filters.',
    voirPlus: n => `Load more (${n} remaining)`,
    aucuneNote: 'No score',
    notesCritiques: 'Critics\' scores',
    copie: 'Copied to clipboard',
    vignettes: 'Grid',
    liste: 'List',
    nouveau: 'New',
    toutVoir: 'See all →',
    nouvellesNotes: 'New scores',
    retourCatalogue: '← Back to catalogue',
    tousMois: 'All',
    annee: 'Year',
    aucuneNouvelleNote: 'No new scores for this period.',
    nbNotes: (n, periode) => `${n} score${n > 1 ? 's' : ''} · ${periode}`,
    copierLaNote: 'Copy this score',
    countries: { france: 'France', argentine: 'Argentina', espagne: 'Spain', chili: 'Chile' },
    colors: { rouge: 'Red', blanc: 'White', 'rosé': 'Rosé', rose: 'Rosé', autre: 'Other' },
  }
};

function t(key, ...args) {
  const val = T[state.lang][key];
  return typeof val === 'function' ? val(...args) : (val ?? key);
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  wines: [],
  criticCols: [],
  lang: localStorage.getItem('wt-lang') || (navigator.language.startsWith('fr') ? 'fr' : 'en'),
  filters: {
    search: '', score: 0,
    pays: 'tous',
    couleur: new Set(),
    domaine: new Set(),
    avail: new Set(),
  },
  sort: 'score',
  view: 'grid', // 'grid' | 'list'
  selected: new Set(),
  modalIdx: null,
  news: null, // { year, month } quand la vue « Nouvelles notes » est ouverte
};

// ── Firestore → shape attendue par le reste de l'app ──────────────────────────
// Chaque document `wines/{id}` a des champs meta (Pays, Domaine ou Marque, ...)
// et un tableau `notes` de { critic, score, comment }. On aplatit ce tableau en
// clés `wine[critic] = score` (comme avant, une colonne par critique) et on
// garde les commentaires + le tableau brut à part pour l'admin et la modale.
function hydrateWine(id, data) {
  const wine = { ...data };
  wine._id = id;
  wine._notes = Array.isArray(data.notes) ? data.notes : [];
  wine._comments = {};
  wine._notes.forEach(n => {
    if (n.critic) {
      wine[n.critic] = n.score || '';
      if (n.comment) wine._comments[n.critic] = n.comment;
    }
  });
  return wine;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const norm = s => (s || '').trim().toLowerCase();

// Extract a wine-range numeric score (80-100) from a potentially mixed string.
// Priority order avoids "TOP 100 VALUE WINES -91" returning 100 instead of 91.
function extractScoreNum(val) {
  if (!val || !val.trim()) return null;
  const clean = val.trim();

  // 1. Pure number — handles "91", "93.5", "91+" and "93-94" (parseFloat stops at first non-digit)
  const direct = parseFloat(clean);
  if (!isNaN(direct) && direct >= 80 && direct <= 100) return direct;

  // 2. Score at END after a dash — "TOP 100 VALUE WINES -91" → 91
  const mEnd = clean.match(/[–-]\s*(\d{2,3})\s*$/);
  if (mEnd) { const n = parseFloat(mEnd[1]); if (n >= 80 && n <= 100) return n; }

  // 3. Score at START — "96 - Top 8 World 2020" → 96
  const mStart = clean.match(/^(\d{2,3}(?:\.\d+)?)/);
  if (mStart) { const n = parseFloat(mStart[1]); if (n >= 80 && n <= 100) return n; }

  // 4. Embedded score, stripping ranking patterns like "TOP 100" first
  const stripped = clean.replace(/\bTOP\s+\d+\b/gi, '');
  const mEmbed = stripped.match(/\b(8[5-9]|9[0-9]|100)\b/);
  if (mEmbed) return parseFloat(mEmbed[1]);

  return null;
}

function getScores(wine) {
  return state.criticCols
    .map(col => ({ col, val: wine[col] }))
    .filter(({ val }) => val !== undefined && val !== '');
}

// Returns only entries where a numeric score can be extracted, with the number
function getNumericScores(wine) {
  return getScores(wine)
    .map(({ col, val }) => ({ col, val, num: extractScoreNum(val) }))
    .filter(({ num }) => num !== null);
}

function maxScore(wine) {
  const nums = getNumericScores(wine);
  return nums.length ? Math.max(...nums.map(s => s.num)) : 0;
}

// ── Notes qualitatives (medailles, /20, etoiles) ──────────────────────────────
// Certains concours ne donnent pas de score /100 mais une medaille ("OR"),
// une note /20 (Jancis Robinson, Le Point) ou des etoiles (Harpers). Ces notes
// existent et doivent apparaitre sur la carte comme dans la fiche.
// NB : elles n'ont volontairement AUCUN equivalent numerique — le tri par score
// et le filtre score minimum restent bases uniquement sur maxScore().

const MEDAL_TIER_RANK = { master: 5, gold: 4, silver: 3, bronze: 2 };

const deaccent = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Detecte une medaille dans une cellule, quel que soit la casse, la langue ou
// le suffixe ("OR (CDG)", "Gold Medal", "ARGENT (VDF)"). Ordre = rang decroissant.
function extractMedal(val) {
  const s = deaccent(val || '').toLowerCase();
  if (/\bmaster\b/.test(s)) return { tier: 'master', label: 'MASTER' };
  if (/\b(double|dble|grand)\s*(gold|or)\b/.test(s)) return { tier: 'gold', label: 'DOUBLE OR' };
  if (/\b(gold|or)\b/.test(s)) return { tier: 'gold', label: 'OR' };
  if (/\b(silver|argent)\b/.test(s)) return { tier: 'silver', label: 'ARGENT' };
  if (/\bbronze\b/.test(s)) return { tier: 'bronze', label: 'BRONZE' };
  return null;
}

// Echelle /20 : la cellule entiere est un nombre entre 5 et 20 ("16", "16,5", "17+")
function extractTwentyScale(val) {
  const s = (val || '').trim();
  if (!/^\d{1,2}([.,]\d+)?\+?$/.test(s)) return null;
  const n = parseFloat(s.replace(',', '.'));
  return (!isNaN(n) && n >= 5 && n <= 20) ? `${s}/20` : null;
}

// Etoiles : "4*", "3*"
function extractStars(val) {
  const m = (val || '').trim().match(/^([1-5])\s*\*+$/);
  return m ? '★'.repeat(+m[1]) : null;
}

// Une entree de badge par cellule notee : numerique, medaille, ou qualitatif.
// `rank` ne sert qu'a l'ordre d'affichage des badges (numeriques d'abord,
// puis medailles par rang, puis le reste).
function getDisplayScores(wine) {
  return getScores(wine).map(({ col, val }) => displayScore(col, val)).sort((a, b) => b.rank - a.rank);
}

// Affichage d'une note isolée (score, médaille ou mention), avec son rang de tri
function displayScore(col, val) {
  const raw = (val || '').trim();

  const num = extractScoreNum(val);
  if (num !== null) {
    return { col, val: raw, kind: 'num', num,
             display: Number.isInteger(num) ? String(num) : num.toFixed(1),
             cls: num > 96 ? 'elite' : '', rank: 1000 + num };
  }

  const medal = extractMedal(raw);
  if (medal) {
    return { col, val: raw, kind: 'medal', display: medal.label,
             cls: `medal-${medal.tier}`, rank: 100 + MEDAL_TIER_RANK[medal.tier] };
  }

  const twenty = extractTwentyScale(raw);
  if (twenty) return { col, val: raw, kind: 'qual', display: twenty, cls: 'qual', rank: 50 };

  const stars = extractStars(raw);
  if (stars) return { col, val: raw, kind: 'qual', display: stars, cls: 'qual', rank: 50 };

  // Note libre : on tronque pour ne pas casser la carte, valeur complete au survol
  const display = raw.length > 16 ? raw.slice(0, 15) + '…' : raw;
  return { col, val: raw, kind: 'qual', display, cls: 'qual', rank: 10 };
}

// Badge partage entre la carte et la vue liste
function scoreBadgeHTML(entry) {
  const abbrev = CRITIC_ABBREV[entry.col] || entry.col;
  const title = entry.display === entry.val ? entry.col : `${entry.col} : ${entry.val}`;
  return `<span class="score-badge ${entry.cls}" title="${escAttr(title)}">${abbrev} ${entry.display}</span>`;
}

// Les 4 premiers badges + compteur de debordement
function buildBadgesHTML(wine) {
  const all = getDisplayScores(wine);
  const visible = all.slice(0, 4);
  const extra = all.length - visible.length;
  if (!visible.length) return '';
  return visible.map(scoreBadgeHTML).join('')
    + (extra > 0 ? `<span class="badge-extra">+${extra}</span>` : '');
}

function isInStock(wine) {
  return norm(wine['Available']) === 'x';
}

function colorCssClass(couleur) {
  const c = norm(couleur);
  if (c === 'rouge') return 'color-rouge';
  if (c === 'blanc') return 'color-blanc';
  if (c === 'rosé' || c === 'rose') return 'color-rose';
  return 'color-autre';
}

function buildCopyLine(wine) {
  const domaine = (wine['Domaine ou Marque'] || '').trim().toUpperCase();
  const nom = (wine['Nom du vin'] || '').trim();
  const mil = (wine['Millésime'] || '').trim();
  const scores = getScores(wine);
  if (!scores.length) return `${domaine} - ${nom} ${mil}`.trim();
  const parts = scores.map(({ col, val }) => `${CRITIC_ABBREV[col] || col} ${val}`);
  return `${domaine} - ${nom} ${mil} : ${parts.join(', ')}`;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function computeKPIs(wines) {
  let all = [], noteCount = 0, elite = 0;
  wines.forEach(w => {
    const nums = getNumericScores(w);
    // La moyenne reste purement numerique, mais une medaille compte comme une note
    if (nums.length) nums.forEach(s => all.push(s.num));
    if (getScores(w).length) noteCount++;
    if (maxScore(w) >= 95) elite++;
  });
  const avg = all.length ? (all.reduce((a, b) => a + b, 0) / all.length).toFixed(1) : '—';
  document.getElementById('kpiTotal').textContent = wines.length;
  document.getElementById('kpiNoted').textContent = noteCount;
  document.getElementById('kpiAvg').innerHTML = avg + '<span class="text-base font-normal text-slate-400">/100</span>';
  document.getElementById('kpiElite').textContent = elite;
}

// ── Counts (for sidebar) ──────────────────────────────────────────────────────
function countsFor(key, wines, normalize) {
  const map = {};
  wines.forEach(w => {
    const v = normalize(w[key]);
    if (v) map[v] = (map[v] || 0) + 1;
  });
  return map;
}

// ── Sidebar filters ───────────────────────────────────────────────────────────
function buildPaysFilter(wines) {
  const el = document.getElementById('filterPays');
  const counts = countsFor('Pays', wines, v => v.trim());
  const allCount = wines.length;

  let html = `<button class="pays-btn ${state.filters.pays === 'tous' ? 'active' : ''}" data-pays="tous">
    <span>Tous</span><span class="count">${allCount}</span>
  </button>`;

  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([pays, cnt]) => {
    const key = norm(pays);
    const flag = COUNTRY_FLAG[key] || '';
    const active = state.filters.pays === key ? 'active' : '';
    html += `<button class="pays-btn ${active}" data-pays="${key}">
      <span>${flag} ${pays}</span><span class="count">${cnt}</span>
    </button>`;
  });
  el.innerHTML = html;

  el.querySelectorAll('.pays-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filters.pays = btn.dataset.pays;
      el.querySelectorAll('.pays-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrid();
    });
  });
}

function buildCheckFilter(containerId, wines, fieldKey, filterSetKey, dotClass) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const counts = countsFor(fieldKey, wines, v => v.trim());
  el.innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([val, cnt]) => {
    const dot = dotClass ? `<span class="${dotClass(norm(val))}"></span>` : '';
    return `<label class="filter-check">
      <span class="lhs">${dot}<input type="checkbox" class="fcheck" data-key="${filterSetKey}" data-val="${norm(val)}" />${val.trim()}</span>
      <span class="count">${cnt}</span>
    </label>`;
  }).join('');

  el.querySelectorAll('.fcheck').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const { key, val } = cb.dataset;
      if (cb.checked) state.filters[key].add(val);
      else state.filters[key].delete(val);
      renderGrid();
    });
  });
}

function buildAvailFilter(wines) {
  const el = document.getElementById('filterAvail');
  const inStock = wines.filter(isInStock).length;
  const epuise = wines.length - inStock;
  el.innerHTML = `
    <label class="filter-check">
      <span class="lhs"><span class="dot-stock"></span><input type="checkbox" class="avail-check" value="stock"/> ${t('enStock')}</span>
      <span class="count">${inStock}</span>
    </label>
    <label class="filter-check">
      <span class="lhs"><span class="dot-epuise"></span><input type="checkbox" class="avail-check" value="epuise"/> ${t('epuise')}</span>
      <span class="count">${epuise}</span>
    </label>`;
  el.querySelectorAll('.avail-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.filters.avail.add(cb.value);
      else state.filters.avail.delete(cb.value);
      renderGrid();
    });
  });
}

function initFilters(wines) {
  buildPaysFilter(wines);
  buildAvailFilter(wines);
  buildCheckFilter('filterCouleur', wines, 'Couleur', 'couleur', c => {
    if (c === 'rouge') return 'dot-rouge';
    if (c === 'blanc') return 'dot-blanc';
    if (c === 'rosé' || c === 'rose') return 'dot-rose';
    return 'dot-autre';
  });
  buildCheckFilter('filterDomaine', wines, 'Domaine ou Marque', 'domaine', null);
}

// ── Recent notes ──────────────────────────────────────────────────────────────
// « oct. 2026 » / « Oct 2026 » selon la langue
function monthFormatter() {
  return new Intl.DateTimeFormat(state.lang === 'en' ? 'en-GB' : 'fr-FR', { month: 'short', year: 'numeric' });
}

function renderRecentNotes(wines) {
  const el = document.getElementById('recentNotes');
  // Une vignette par note datée : on affiche la note reçue, pas la dernière saisie
  const latest = datedNoteEntries(wines).slice(0, 15);

  if (!latest.length) {
    el.innerHTML = '<div class="text-xs text-slate-400 italic py-2">—</div>';
    return;
  }

  el.innerHTML = latest.map(({ wine: w, note }) => {
    const colorClass = colorCssClass(w['Couleur']);
    const num = extractScoreNum(note.score);
    const abbrev = CRITIC_ABBREV[note.critic] || note.critic;
    const shown = num !== null ? Math.round(num) : note.score;
    const pays = norm(w['Pays']);
    const countryCode = COUNTRY_CODE[pays] || '';
    const idx = state.wines.indexOf(w);
    return `
      <div class="recent-card ${colorClass}" data-idx="${idx}" style="border-left-width:3px">
        <div style="flex:1;min-width:0">
          <div class="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5 truncate">${(w['Domaine ou Marque'] || '').trim()} · ${countryCode}</div>
          <div class="text-sm font-bold text-slate-900 leading-tight truncate">${w['Nom du vin'] || ''}</div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">${w['Millésime'] || ''}${w['Millésime'] ? ' · ' : ''}${note.date}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;max-width:76px">
          <div class="big-score" style="${num === null ? 'font-size:0.66rem;line-height:1.25;' : ''}">${shown}</div>
          <div class="score-critic">${abbrev}</div>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.recent-card').forEach(card => {
    card.addEventListener('click', () => openModal(+card.dataset.idx));
  });

  // Drag scroll (clic + glisser gauche/droite)
  let isDragging = false, startX = 0, scrollStart = 0;
  el.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.pageX;
    scrollStart = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    el.scrollLeft = scrollStart - (e.pageX - startX);
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
    el.style.cursor = 'grab';
    el.style.userSelect = '';
  });
}

// ── Filtering & sorting ───────────────────────────────────────────────────────
function wineMatches(wine) {
  const f = state.filters;
  if (f.score > 0 && maxScore(wine) < f.score) return false;
  return wineMatchesExceptScore(wine);
}

// Tous les filtres sauf le score minimum (la vue Nouvelles notes l'applique note par note)
function wineMatchesExceptScore(wine) {
  const f = state.filters;

  if (f.search) {
    const q = norm(f.search);
    // Si la recherche est numérique, cherche dans les valeurs de scores de tous les critiques
    const isNumericQuery = /^\d{2,3}$/.test(f.search.trim());
    if (isNumericQuery) {
      const scoreMatch = state.criticCols.some(col => {
        const extracted = extractScoreNum(wine[col]);
        return extracted !== null && Math.round(extracted) === parseInt(f.search.trim(), 10);
      });
      if (!scoreMatch) return false;
    } else {
      // Chaque mot de la requête doit apparaître quelque part dans le hay
      const criticNames = state.criticCols
        .filter(c => wine[c])
        .flatMap(c => [c, CRITIC_ABBREV[c] || '']);
      const hay = norm([
        wine['Nom du vin'], wine['Domaine ou Marque'], wine['Millésime'],
        wine['Couleur'], wine['Pays'],
        ...criticNames
      ].join(' '));
      const tokens = q.split(/\s+/).filter(Boolean);
      if (!tokens.every(token => hay.includes(token))) return false;
    }
  }


  if (f.pays !== 'tous' && norm(wine['Pays']) !== f.pays) return false;

  if (f.couleur.size && !f.couleur.has(norm(wine['Couleur']))) return false;

  if (f.domaine.size && !f.domaine.has(norm(wine['Domaine ou Marque']))) return false;

  if (f.avail.size) {
    const stock = isInStock(wine);
    if (f.avail.has('stock') && !f.avail.has('epuise') && !stock) return false;
    if (f.avail.has('epuise') && !f.avail.has('stock') && stock) return false;
  }

  return true;
}

function sortWines(arr) {
  const copy = [...arr];
  switch (state.sort) {
    case 'score': return copy.sort((a, b) => maxScore(b) - maxScore(a));
    case 'name':  return copy.sort((a, b) => (a['Nom du vin'] || '').localeCompare(b['Nom du vin'] || ''));
    case 'domaine': return copy.sort((a, b) => (a['Domaine ou Marque'] || '').localeCompare(b['Domaine ou Marque'] || ''));
    case 'millesime': return copy.sort((a, b) => (+b['Millésime'] || 0) - (+a['Millésime'] || 0));
    default: return copy;
  }
}

// ── Card rendering ────────────────────────────────────────────────────────────
function renderCard(wine, originalIdx) {
  const colorClass = colorCssClass(wine['Couleur']);
  const stock = isInStock(wine);
  const isSelected = state.selected.has(originalIdx);
  const pays = norm(wine['Pays']);
  const code = COUNTRY_CODE[pays] || '';

  const badgesHTML = buildBadgesHTML(wine)
    || `<span class="no-score">${t('aucuneNote')}</span>`;

  return `
    <div class="wine-card ${colorClass} ${isSelected ? 'selected' : ''}" data-idx="${originalIdx}">

      <!-- Domaine + actions (crayon admin + checkbox) -->
      <div class="card-row-top">
        <span class="card-domaine">${(wine['Domaine ou Marque'] || '').trim()}</span>
        <div class="card-row-actions">
          ${isAdmin ? `<button class="card-edit-btn" data-idx="${originalIdx}" title="${t('modifier')}">${ICON_PENCIL_SVG}</button>` : ''}
          <input type="checkbox" class="card-checkbox" data-idx="${originalIdx}" ${isSelected ? 'checked' : ''} />
        </div>
      </div>

      <!-- Nom du vin + millésime -->
      <div class="card-name-row">
        <span class="card-name">${wine['Nom du vin'] || ''}</span>
        <span class="card-vintage-inline">${wine['Millésime'] || '—'}</span>
      </div>

      <!-- Badges de score -->
      <div class="card-badges">${badgesHTML}</div>

      <!-- Footer discret : stock + copier (toujours là, léger) -->
      <div class="card-footer">
        ${stockFeatureEnabled ? `<span class="stock-pill ${stock ? 'en' : 'ep'}">
          <span class="stock-dot" style="background:${stock ? '#10b981' : '#d1d5db'}"></span>
          ${stock ? t('enStock') : t('epuise')}
        </span>` : '<span></span>'}
        <button class="card-copy-btn" data-idx="${originalIdx}" title="${t('copierNotes')}">
          <svg width="13" height="13" viewBox="0 0 115.77 122.88" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M89.62,13.96v7.73h12.19v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02v73.29h-0.02c-0.01,3.84-1.57,7.33-4.1,9.86c-2.51,2.5-5.98,4.06-9.82,4.07v0.02H40.1v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82h-0.02V92.51H13.96v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1C1.6,85.88,0.04,82.41,0.03,78.57H0V13.96h0.02C0.03,10.11,1.6,6.62,4.12,4.1C6.63,1.6,10.1,0.04,13.94,0.03V0h61.72v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02V13.96zM79.04,21.69v-7.73h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02H13.96v-0.02c-0.91,0-1.75,0.39-2.37,1.01c-0.61,0.61-1,1.46-1,2.37h0.02v64.62h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h12.19V35.65h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07v-0.02H79.04zM105.18,108.92V35.65h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02H40.1v-0.02c-0.91,0-1.75,0.39-2.37,1.01c-0.61,0.61-1,1.46-1,2.37h0.02v73.29h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h61.72v0.02c0.91,0,1.75-0.39,2.37-1.01c0.61-0.61,1-1.46,1-2.37h-0.02z"/></svg>
        </button>
      </div>
    </div>`;
}

// ── List row rendering ────────────────────────────────────────────────────────
function renderRow(wine, originalIdx) {
  const colorClass = colorCssClass(wine['Couleur']);
  const stock = isInStock(wine);
  const isSelected = state.selected.has(originalIdx);
  const pays = norm(wine['Pays']);
  const code = COUNTRY_CODE[pays] || '';

  const badgesHTML = buildBadgesHTML(wine);

  const colorDot = {
    'color-rouge': '#c0392b',
    'color-blanc': '#C9A84C',
    'color-rose':  '#db2777',
    'color-autre': '#94a3b8',
  }[colorClass] || '#94a3b8';

  return `
    <div class="list-row ${isSelected ? 'selected' : ''}" data-idx="${originalIdx}">
      <!-- Couleur dot -->
      <span class="list-color-dot" style="background:${colorDot}"></span>

      <!-- Nom + millésime -->
      <div class="list-name-cell">
        <span class="list-name">${wine['Nom du vin'] || ''}</span>
        <span class="list-vintage">${wine['Millésime'] || '—'}</span>
      </div>

      <!-- Domaine + pays -->
      <div class="list-domaine-cell">
        <span class="list-domaine">${(wine['Domaine ou Marque'] || '').trim()}</span>
        <span class="list-code">${code}</span>
      </div>

      <!-- Scores -->
      <div class="list-badges">${badgesHTML || '<span class="no-score">—</span>'}</div>

      <!-- Actions -->
      <div class="list-actions">
        ${stockFeatureEnabled ? `<span class="list-stock ${stock ? 'en' : 'ep'}">${stock ? '● ' + t('enStock') : '○ ' + t('epuise')}</span>` : ''}
        <button class="card-copy-btn" data-idx="${originalIdx}" title="${t('copierNotes')}">
          <svg width="13" height="13" viewBox="0 0 115.77 122.88" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M89.62,13.96v7.73h12.19v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02v73.29h-0.02c-0.01,3.84-1.57,7.33-4.1,9.86c-2.51,2.5-5.98,4.06-9.82,4.07v0.02H40.1v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82h-0.02V92.51H13.96v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1C1.6,85.88,0.04,82.41,0.03,78.57H0V13.96h0.02C0.03,10.11,1.6,6.62,4.12,4.1C6.63,1.6,10.1,0.04,13.94,0.03V0h61.72v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02V13.96zM79.04,21.69v-7.73h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02H13.96v-0.02c-0.91,0-1.75,0.39-2.37,1.01c-0.61,0.61-1,1.46-1,2.37h0.02v64.62h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h12.19V35.65h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07v-0.02H79.04zM105.18,108.92V35.65h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02H40.1v-0.02c-0.91,0-1.75,0.39-2.37,1.01c-0.61,0.61-1,1.46-1,2.37h0.02v73.29h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h61.72v0.02c0.91,0,1.75-0.39,2.37-1.01c0.61-0.61,1-1.46,1-2.37h-0.02z"/></svg>
        </button>
        ${isAdmin ? `<button class="card-edit-btn" data-idx="${originalIdx}" title="${t('modifier')}">${ICON_PENCIL_SVG}</button>` : ''}
        <input type="checkbox" class="card-checkbox" data-idx="${originalIdx}" ${isSelected ? 'checked' : ''} />
      </div>
    </div>`;
}

// ── Grid (with progressive rendering for performance) ─────────────────────────
const PAGE_SIZE = 60;
let currentPage = 1;
let lastFiltered = [];

// Attache tous les événements sur la grille (click modal, checkbox, copier)
function bindEvents(container) {
  const selector = state.view === 'list' ? '.list-row' : '.wine-card';
  container.querySelectorAll(selector).forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-checkbox') || e.target.closest('.card-copy-btn') || e.target.closest('.card-edit-btn')) return;
      openModal(+card.dataset.idx);
    });
  });
  container.querySelectorAll('.card-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wine = state.wines[+btn.dataset.idx];
      if (!wine || !openAdminEditForm) return;
      document.getElementById('adminPanel').style.display = 'flex';
      openAdminEditForm(wine._id);
    });
  });
  container.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const idx = +cb.dataset.idx;
      if (cb.checked) state.selected.add(idx);
      else state.selected.delete(idx);
      const card = cb.closest('.wine-card') || cb.closest('.list-row');
      if (card) card.classList.toggle('selected', cb.checked);
      updateMultiBar();
    });
  });
  container.querySelectorAll('.card-copy-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      copyToClipboard(buildCopyLine(state.wines[+btn.dataset.idx]));
    });
  });
}

function renderGrid() {
  if (state.news) renderNewsView();
  currentPage = 1;
  lastFiltered = sortWines(state.wines.filter(wineMatches));
  const grid = document.getElementById('wineGrid');
  const countEl = document.getElementById('resultCount');

  countEl.textContent = t('vinsTotal', lastFiltered.length);

  // Classes selon le mode
  if (state.view === 'list') {
    grid.className = 'px-4 sm:px-6 pb-8 flex flex-col';
  } else {
    grid.className = 'px-4 sm:px-6 pb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3';
  }

  if (!lastFiltered.length) {
    grid.innerHTML = `<div class="col-span-full text-sm text-slate-400 py-16 text-center">${t('aucunVin')}</div>`;
    return;
  }

  const renderFn = state.view === 'list' ? renderRow : renderCard;
  const page = lastFiltered.slice(0, PAGE_SIZE);
  grid.innerHTML = page.map(w => renderFn(w, state.wines.indexOf(w))).join('');

  if (lastFiltered.length > PAGE_SIZE) {
    const sentinel = document.createElement('div');
    sentinel.id = 'loadMore';
    sentinel.className = 'col-span-full flex justify-center py-6';
    sentinel.innerHTML = `<button onclick="loadMoreCards()" class="text-xs text-slate-500 border border-slate-200 hover:border-slate-400 bg-white px-5 py-2 rounded-full transition-colors">
      ${t('voirPlus', lastFiltered.length - PAGE_SIZE)}
    </button>`;
    grid.appendChild(sentinel);
  }

  bindEvents(grid);
}

function loadMoreCards() {
  currentPage++;
  const grid = document.getElementById('wineGrid');
  const sentinel = document.getElementById('loadMore');
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = currentPage * PAGE_SIZE;
  const batch = lastFiltered.slice(start, end);

  const renderFn = state.view === 'list' ? renderRow : renderCard;
  const selector = state.view === 'list' ? '.list-row' : '.wine-card';

  const tmp = document.createElement('div');
  tmp.innerHTML = batch.map(w => renderFn(w, state.wines.indexOf(w))).join('');
  const frag = document.createDocumentFragment();
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);

  if (sentinel) {
    grid.removeChild(sentinel);
    if (end < lastFiltered.length) {
      const newSentinel = document.createElement('div');
      newSentinel.id = 'loadMore';
      newSentinel.className = 'col-span-full flex justify-center py-6';
      newSentinel.innerHTML = `<button onclick="loadMoreCards()" class="text-xs text-slate-500 border border-slate-200 hover:border-slate-400 px-5 py-2 rounded-full transition-colors">
        ${t('voirPlus', lastFiltered.length - end)}
      </button>`;
      grid.appendChild(frag);
      grid.appendChild(newSentinel);
    } else {
      grid.appendChild(frag);
    }
  }

  bindEvents(grid);
}

// ── Multi-select bar ──────────────────────────────────────────────────────────
function updateMultiBar() {
  const bar = document.getElementById('multiBar');
  const n = state.selected.size;
  if (n > 0) {
    document.getElementById('multiCount').textContent = t('vinsSelectionnes', n);
    bar.style.display = 'block';
    bar.classList.remove('hidden');
  } else {
    bar.style.display = 'none';
    bar.classList.add('hidden');
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
// ── Vue « Nouvelles notes » ───────────────────────────────────────────────────
// Une ligne par note datée, par année / mois. Les filtres de la barre latérale
// s'appliquent ; le score minimum porte sur la note elle-même.
const COPY_ICON_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function noteMatchesFilters({ wine, note }) {
  if (!wineMatchesExceptScore(wine)) return false;
  if (state.filters.score > 0) {
    const num = extractScoreNum(note.score);
    if (num === null || num < state.filters.score) return false;
  }
  return true;
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const entryCopyLine = e => noteCopyLine(e.wine, e.note, CRITIC_ABBREV[e.note.critic] || e.note.critic);

function openNewsView() {
  // Année en cours par défaut (une date future saisie par erreur ne doit pas l'emporter)
  state.news = { year: new Date().getFullYear(), month: null, shown: [] };
  document.getElementById('catalogueView').classList.add('hidden');
  document.getElementById('newsView').classList.remove('hidden');
  renderNewsView();
  document.querySelector('main').scrollTop = 0;
}

function closeNewsView() {
  state.news = null;
  document.getElementById('newsView').classList.add('hidden');
  document.getElementById('catalogueView').classList.remove('hidden');
}

function renderNewsView() {
  const el = document.getElementById('newsView');
  const news = state.news;
  const all = datedNoteEntries(state.wines).filter(noteMatchesFilters);
  const years = yearsWithNotes(all);
  if (!years.includes(news.year)) news.year = years[0];
  const months = monthsWithNotes(all, news.year);
  if (news.month && !months.has(news.month)) news.month = null;
  news.shown = filterByPeriod(all, news.year, news.month);

  const locale = state.lang === 'en' ? 'en-GB' : 'fr-FR';
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' });
  const monthLong = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const periode = news.month ? capitalize(monthLong.format(new Date(news.year, news.month - 1, 1))) : String(news.year);

  const monthBtns = [`<button type="button" class="news-month ${news.month ? '' : 'on'}" data-month="">${t('tousMois')}</button>`]
    .concat(Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return `<button type="button" class="news-month ${news.month === m ? 'on' : ''}" data-month="${m}" ${months.has(m) ? '' : 'disabled'}>${capitalize(monthShort.format(new Date(news.year, i, 1)).replace('.', ''))}</button>`;
    })).join('');

  // Groupes par mois, du plus récent au plus ancien (les entrées sont déjà triées)
  let rows = '';
  let currentKey = '';
  news.shown.forEach((e, i) => {
    const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
    if (key !== currentKey) {
      currentKey = key;
      rows += `<h3 class="news-group">${capitalize(monthLong.format(e.date))}</h3>`;
    }
    const w = e.wine;
    rows += `
      <div class="news-row ${colorCssClass(w['Couleur'])}" data-i="${i}">
        <span class="news-row__date">${e.note.date.slice(0, 5)}</span>
        <span class="news-row__wine">
          <span class="news-row__domaine">${(w['Domaine ou Marque'] || '').trim()}</span>
          <span class="news-row__name">${w['Nom du vin'] || ''} <span class="news-row__vintage">${w['Millésime'] || ''}</span></span>
        </span>
        ${scoreBadgeHTML(displayScore(e.note.critic, e.note.score))}
        <button type="button" class="news-row__copy" data-copy="${i}" title="${escAttr(t('copierLaNote'))}">${COPY_ICON_SVG}</button>
      </div>`;
  });

  el.innerHTML = `
    <div class="news-head">
      <button type="button" class="news-back" data-news="back">${t('retourCatalogue')}</button>
      <h2 class="news-title">${t('nouvellesNotes')}</h2>
      <button type="button" class="news-copy" data-news="copy" ${news.shown.length ? '' : 'disabled'}>${COPY_ICON_SVG}<span>${t('copier')}</span></button>
    </div>
    <div class="news-period">
      <select class="news-year" aria-label="${escAttr(t('annee'))}">${years.map(y => `<option value="${y}" ${y === news.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <div class="news-months scrollbar-hide">${monthBtns}</div>
    </div>
    <p class="news-count">${t('nbNotes', news.shown.length, periode)}</p>
    ${rows || `<p class="news-empty">${t('aucuneNouvelleNote')}</p>`}`;
}

function initNewsView() {
  document.getElementById('recentNotesOpen').addEventListener('click', openNewsView);
  document.getElementById('recentNotesAll').addEventListener('click', openNewsView);

  const el = document.getElementById('newsView');
  el.addEventListener('click', e => {
    const target = e.target.closest('button, .news-row');
    if (!target || !state.news) return;
    const shown = state.news.shown;
    if (target.dataset.news === 'back') closeNewsView();
    else if (target.dataset.news === 'copy') copyToClipboard(shown.map(entryCopyLine).join('\n'));
    else if (target.classList.contains('news-month')) {
      state.news.month = target.dataset.month ? +target.dataset.month : null;
      renderNewsView();
    } else if (target.dataset.copy !== undefined) copyToClipboard(entryCopyLine(shown[+target.dataset.copy]));
    else if (target.classList.contains('news-row')) openModal(state.wines.indexOf(shown[+target.dataset.i].wine));
  });
  el.addEventListener('change', e => {
    if (!e.target.classList.contains('news-year')) return;
    state.news.year = +e.target.value;
    state.news.month = null;
    renderNewsView();
  });
}

function openModal(idx) {
  const wine = state.wines[idx];
  if (!wine) return;
  state.modalIdx = idx;

  const colorClass = colorCssClass(wine['Couleur']);
  const stock = isInStock(wine);
  const pays = norm(wine['Pays']);
  const code = COUNTRY_CODE[pays] || '';
  const flag = COUNTRY_FLAG[pays] || '';

  // Header
  document.getElementById('modalHeader').className =
    `border-l-4 px-6 pt-6 pb-4 flex-shrink-0 modal-${colorClass}`;
  document.getElementById('modalDomaine').textContent =
    `${(wine['Domaine ou Marque'] || '').trim()} · ${flag} ${code}`;
  document.getElementById('modalNom').textContent = wine['Nom du vin'] || '';
  document.getElementById('modalMeta').textContent =
    `${wine['Millésime'] || '—'} · ${(wine['Couleur'] || '').trim()} · ${(wine['Pays'] || '').trim()}`;

  // Notes — les plus récentes d'abord (mois + badge « Nouveau »), puis l'historique
  // dans le même classement que les badges. La fiche affiche la valeur brute
  // ("OR (CDG)") mais reprend la couleur de la medaille.
  const rankedCritics = getDisplayScores(wine).map(e => e.col);
  const notes = orderNotesForModal(wine._notes.filter(n => n.critic && (n.score || '').trim()), rankedCritics);
  const monthFmt = monthFormatter();

  document.getElementById('modalScores').innerHTML = notes.length
    ? `<div class="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-2">${t('notesCritiques')}</div>
       <div>${notes.map(note => {
         const { col, val, cls } = displayScore(note.critic, note.score);
         const abbrev = CRITIC_ABBREV[col] || col;
         const date = parseFrDate(note.date);
         const dateHTML = date
           ? ` <span class="modal-note-date">${monthFmt.format(date)}</span>${isNewNote(note) ? ` <span class="badge-new">${t('nouveau')}</span>` : ''}`
           : '';
         return `<div class="modal-score-row">
           <span class="modal-critic-name">${col} <span class="text-slate-400 text-xs">(${abbrev})</span>${dateHTML}</span>
           <span class="modal-score-val ${cls}">${val}</span>
         </div>${note.comment ? `<div class="text-xs text-slate-400 italic mb-2" style="padding-left:2px">${note.comment}</div>` : ''}`;
       }).join('')}</div>`
    : `<div class="text-sm text-slate-400 italic">${t('aucuneNote')}.</div>`;

  // Récap email masqué
  document.getElementById('modalRecap').innerHTML = '';

  // Stock
  document.getElementById('modalStock').innerHTML = stockFeatureEnabled
    ? (stock
        ? `<span class="text-xs font-semibold text-emerald-600">● ${t('enStock')}</span>`
        : `<span class="text-xs font-semibold text-slate-400">○ ${t('epuise')}</span>`)
    : '';

  // Copy button
  document.getElementById('modalCopyBtn').onclick = () => {
    copyToClipboard(buildCopyLine(wine));
  };

  // Show modal
  const overlay = document.getElementById('modalOverlay');
  overlay.style.display = 'flex';
  overlay.classList.remove('hidden');
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.style.display = 'none';
  overlay.classList.add('hidden');
  state.modalIdx = null;
}

// ── Clipboard & toast ─────────────────────────────────────────────────────────
function copyToClipboard(text) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    Object.assign(ta.style, { position: 'fixed', opacity: '0' });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast();
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(showToast).catch(fallback);
  } else fallback();
}

let toastTimer;
function showToast() {
  const el = document.getElementById('toast');
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

// ── Export ────────────────────────────────────────────────────────────────────
const EXPORT_META_COLS = ['Pays', 'Domaine ou Marque', 'Couleur', 'Nom du vin', 'Millésime', 'Available', 'date_ajout'];

function buildExportRows() {
  return state.wines.map(w => {
    const row = {};
    EXPORT_META_COLS.forEach(c => { row[c] = w[c] || ''; });
    state.criticCols.forEach(c => { row[c] = w[c] || ''; });
    row['Commentaires'] = Object.entries(w._comments || {})
      .map(([critic, comment]) => `${CRITIC_ABBREV[critic] || critic}: ${comment}`)
      .join(' | ');
    return row;
  });
}

function exportXLSX() {
  const rows = buildExportRows();
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Wine Awards');
  const today = new Date();
  const dateStr = [String(today.getDate()).padStart(2, '0'), String(today.getMonth() + 1).padStart(2, '0'), today.getFullYear()].join('-');
  XLSX.writeFile(wb, `wine-awards-lurton-${dateStr}.xlsx`);
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────
const CRITIC_NAMES = Object.keys(CRITIC_ABBREV);
const ICON_DUPLICATE_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>';
let adminEditingId = null; // null = pas d'édition, 'new' = nouveau vin, sinon _id du vin édité
let adminNotesDraft = [];  // notes en cours d'édition dans le formulaire

async function reloadWines() {
  const snap = await getDocs(collection(db, 'wines'));
  state.wines = snap.docs.map(d => hydrateWine(d.id, d.data()));
  state.criticCols = [...new Set(state.wines.flatMap(w => w._notes.map(n => n.critic)))];
  computeKPIs(state.wines);
  initFilters(state.wines);
  renderRecentNotes(state.wines);
  renderGrid();
}

function initAdminPanel() {
  const panel       = document.getElementById('adminPanel');
  const closeBtn    = document.getElementById('adminClose');
  const loginView   = document.getElementById('adminLoginView');
  const mainView    = document.getElementById('adminMainView');
  const passwordIn  = document.getElementById('adminPassword');
  const loginBtn    = document.getElementById('adminLoginBtn');
  const loginStatus = document.getElementById('adminLoginStatus');
  const logoutBtn   = document.getElementById('adminLogoutBtn');
  const check       = document.getElementById('adminStockCheck');
  const slider      = document.getElementById('adminStockSlider');
  const knob        = document.getElementById('adminStockKnob');
  const addWineBtn  = document.getElementById('adminAddWineBtn');
  const searchIn    = document.getElementById('adminWineSearch');
  const listEl      = document.getElementById('adminWineList');
  const formEl      = document.getElementById('adminEditForm');
  const notesListEl = document.getElementById('adminNotesList');
  const addNoteBtn  = document.getElementById('adminAddNoteBtn');
  const saveBtn     = document.getElementById('adminSaveWineBtn');
  const deleteBtn   = document.getElementById('adminDeleteWineBtn');
  const cancelBtn   = document.getElementById('adminCancelEditBtn');
  const status      = document.getElementById('adminStatus');

  function syncToggleUI() {
    check.checked = stockFeatureEnabled;
    slider.style.background = stockFeatureEnabled ? '#10b981' : '#334155';
    knob.style.transform    = stockFeatureEnabled ? 'translateX(18px)' : 'translateX(0)';
  }
  syncToggleUI();

  check.addEventListener('change', async () => {
    stockFeatureEnabled = check.checked;
    syncToggleUI();
    applyStockFeature();
    try {
      await setDoc(doc(db, 'config', 'site'), { showStock: stockFeatureEnabled }, { merge: true });
    } catch {
      status.style.color = '#f87171';
      status.textContent = 'Erreur de sauvegarde du réglage stock.';
    }
  });

  function showLoggedIn() {
    loginView.style.display = 'none';
    mainView.style.display = 'block';
    renderAdminWineList();
  }
  function showLoggedOut() {
    loginView.style.display = 'block';
    mainView.style.display = 'none';
    formEl.style.display = 'none';
    adminEditingId = null;
  }

  onAuthStateChanged(auth, user => {
    isAdmin = !!(user && user.email === ADMIN_EMAIL);
    if (isAdmin) showLoggedIn();
    else showLoggedOut();
    renderGrid();
  });

  loginBtn.addEventListener('click', async () => {
    const pwd = passwordIn.value;
    if (!pwd) { loginStatus.style.color = '#f87171'; loginStatus.textContent = 'Mot de passe requis.'; return; }
    loginBtn.disabled = true;
    loginStatus.style.color = '#94a3b8';
    loginStatus.textContent = 'Connexion…';
    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pwd);
      passwordIn.value = '';
      loginStatus.textContent = '';
    } catch {
      loginStatus.style.color = '#f87171';
      loginStatus.textContent = 'Mot de passe incorrect.';
    } finally {
      loginBtn.disabled = false;
    }
  });
  passwordIn.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

  logoutBtn.addEventListener('click', () => signOut(auth));

  function renderAdminWineList() {
    const tokens = norm(searchIn.value).split(/\s+/).filter(Boolean);
    const filtered = state.wines
      .filter(w => {
        if (!tokens.length) return true;
        const hay = norm(`${w['Domaine ou Marque']} ${w['Nom du vin']} ${w['Millésime']}`);
        return tokens.every(tok => hay.includes(tok));
      })
      .sort((a, b) => (+b['Millésime'] || 0) - (+a['Millésime'] || 0));
    listEl.innerHTML = filtered.map(w => `
      <div class="admin-wine-row" data-id="${w._id}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #334155;font-size:0.78rem">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${(w['Domaine ou Marque'] || '').trim()} — ${w['Nom du vin'] || ''} (${w['Millésime'] || '—'})</span>
        <div class="admin-row-actions">
          <button class="admin-row-btn" data-action="duplicate" data-id="${w._id}" title="Dupliquer">${ICON_DUPLICATE_SVG}</button>
          <button class="admin-row-btn" data-action="edit" data-id="${w._id}" title="Modifier">${ICON_PENCIL_SVG}</button>
          <button class="admin-row-btn admin-row-btn-delete" data-action="delete" data-id="${w._id}" title="Supprimer">✕</button>
        </div>
      </div>`).join('') || '<div style="padding:10px;font-size:0.75rem;color:#64748b">Aucun vin.</div>';

    listEl.querySelectorAll('.admin-row-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const { action, id } = btn.dataset;
        if (action === 'edit') openEditForm(id);
        else if (action === 'duplicate') startDuplicate(id);
        else if (action === 'delete') deleteWineById(id);
      });
    });
  }
  searchIn.addEventListener('input', renderAdminWineList);

  function noteRowHTML(note, i) {
    const options = CRITIC_NAMES.map(c => `<option value="${c}" ${c === note.critic ? 'selected' : ''}>${c}</option>`).join('');
    return `
      <div class="admin-note-row" data-i="${i}" style="border:1px solid #334155;border-radius:8px;padding:8px;margin-bottom:8px">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <select class="note-critic" style="flex:2;min-width:0;background:#0f172a;border:1px solid #334155;color:#f8fafc;border-radius:6px;font-size:0.72rem;padding:5px">${options}</select>
          <input class="note-score" value="${note.score || ''}" placeholder="Note (ex. 93)" style="flex:1;min-width:0;background:#0f172a;border:1px solid #334155;color:#f8fafc;border-radius:6px;font-size:0.72rem;padding:5px" />
          <input class="note-date" type="date" value="${frToIso(note.date)}" title="Date de réception (vide = note historique)" style="flex:none;width:132px;background:#0f172a;border:1px solid #334155;color:#f8fafc;color-scheme:dark;border-radius:6px;font-size:0.72rem;padding:5px" />
          <button class="note-delete" title="Supprimer" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:14px">✕</button>
        </div>
        <textarea class="note-comment" placeholder="Commentaire de dégustation (optionnel)" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;color:#f8fafc;border-radius:6px;font-size:0.72rem;padding:5px;min-height:44px">${note.comment || ''}</textarea>
      </div>`;
  }

  function renderNotesDraft() {
    notesListEl.innerHTML = adminNotesDraft.map(noteRowHTML).join('') || '<p style="font-size:0.72rem;color:#64748b">Aucune note.</p>';
    notesListEl.querySelectorAll('.admin-note-row').forEach(row => {
      const i = +row.dataset.i;
      row.querySelector('.note-critic').addEventListener('change', e => { adminNotesDraft[i].critic = e.target.value; });
      row.querySelector('.note-score').addEventListener('input', e => { adminNotesDraft[i].score = e.target.value; });
      row.querySelector('.note-comment').addEventListener('input', e => { adminNotesDraft[i].comment = e.target.value; });
      row.querySelector('.note-date').addEventListener('input', e => { adminNotesDraft[i].date = isoToFr(e.target.value); });
      row.querySelector('.note-delete').addEventListener('click', () => {
        adminNotesDraft.splice(i, 1);
        renderNotesDraft();
      });
    });
  }

  addNoteBtn.addEventListener('click', () => {
    adminNotesDraft.push({ critic: CRITIC_NAMES[0], score: '', comment: '', date: todayFr() });
    renderNotesDraft();
  });

  function fillForm(wine) {
    document.getElementById('fPays').value = norm(wine?.['Pays'] || 'france');
    document.getElementById('fDomaine').value = wine?.['Domaine ou Marque'] || '';
    document.getElementById('fCouleur').value = norm(wine?.['Couleur'] || 'rouge');
    document.getElementById('fNom').value = wine?.['Nom du vin'] || '';
    document.getElementById('fMillesime').value = wine?.['Millésime'] || '';
    document.getElementById('fAvailable').checked = isInStock(wine || {});
    // Fiche datée mais pas encore rattrapée : sa date passe sur la dernière note,
    // sinon l'enregistrement effacerait date_ajout pour de bon
    adminNotesDraft = datedFromLegacy(wine?._notes || [], wine?.['date_ajout']);
    renderNotesDraft();
  }

  function openEditForm(id) {
    adminEditingId = id;
    const wine = state.wines.find(w => w._id === id);
    fillForm(wine);
    formEl.style.display = 'block';
    deleteBtn.style.display = 'inline-block';
    status.textContent = '';
  }
  openAdminEditForm = openEditForm;

  addWineBtn.addEventListener('click', () => {
    adminEditingId = 'new';
    fillForm(null);
    formEl.style.display = 'block';
    deleteBtn.style.display = 'none';
    status.textContent = '';
  });

  cancelBtn.addEventListener('click', () => {
    formEl.style.display = 'none';
    adminEditingId = null;
  });

  function startDuplicate(id) {
    const wine = state.wines.find(w => w._id === id);
    if (!wine) return;
    adminEditingId = 'new';
    fillForm(wine);
    formEl.style.display = 'block';
    deleteBtn.style.display = 'none';
    status.textContent = '';
    const milInput = document.getElementById('fMillesime');
    milInput.value = '';
    milInput.focus();
    // Les notes copiées ne sont pas de nouvelles notes
    adminNotesDraft.forEach(n => { n.date = ''; });
    renderNotesDraft();
  }

  function readForm() {
    const paysMap = { france: 'France', argentine: 'Argentine', espagne: 'Espagne', chili: 'Chili' };
    const couleurMap = { rouge: 'Rouge', blanc: 'Blanc', 'rosé': 'Rosé', autre: 'Autre' };
    const notes = adminNotesDraft.filter(n => n.critic && n.score).map(cleanNote);
    return {
      'Pays': paysMap[document.getElementById('fPays').value] || '',
      'Domaine ou Marque': document.getElementById('fDomaine').value.trim(),
      'Couleur': couleurMap[document.getElementById('fCouleur').value] || '',
      'Nom du vin': document.getElementById('fNom').value.trim(),
      'Millésime': document.getElementById('fMillesime').value.trim(),
      'Available': document.getElementById('fAvailable').checked ? 'x' : '',
      // La date de la fiche suit toujours sa note la plus récente
      'date_ajout': latestNoteDate(notes),
      notes,
    };
  }

  saveBtn.addEventListener('click', async () => {
    const data = readForm();
    if (!data['Nom du vin']) { status.style.color = '#f87171'; status.textContent = 'Le nom du vin est requis.'; return; }
    saveBtn.disabled = true;
    status.style.color = '#94a3b8';
    status.textContent = 'Enregistrement…';
    try {
      if (adminEditingId === 'new') {
        await addDoc(collection(db, 'wines'), data);
      } else {
        await updateDoc(doc(db, 'wines', adminEditingId), data);
      }
      await reloadWines();
      renderAdminWineList();
      formEl.style.display = 'none';
      adminEditingId = null;
      status.style.color = '#10b981';
      status.textContent = 'Enregistré.';
    } catch (err) {
      status.style.color = '#f87171';
      status.textContent = 'Erreur : ' + err.message;
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function deleteWineById(id) {
    if (!id || id === 'new') return;
    if (!confirm('Supprimer définitivement ce vin ?')) return;
    try {
      await deleteDoc(doc(db, 'wines', id));
      await reloadWines();
      renderAdminWineList();
      if (adminEditingId === id) {
        formEl.style.display = 'none';
        adminEditingId = null;
      }
    } catch (err) {
      status.style.color = '#f87171';
      status.textContent = 'Erreur : ' + err.message;
    }
  }

  deleteBtn.addEventListener('click', () => deleteWineById(adminEditingId));

  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Charge config/site pour l'état global du stock (visible par tous)
  try {
    const cfgSnap = await getDoc(doc(db, 'config', 'site'));
    if (cfgSnap.exists() && typeof cfgSnap.data().showStock === 'boolean') {
      stockFeatureEnabled = cfgSnap.data().showStock;
    }
  } catch { /* config absente ou invalide : on garde la valeur par défaut */ }

  try {
    const snap = await getDocs(collection(db, 'wines'));
    state.wines = snap.docs.map(d => hydrateWine(d.id, d.data()));
    state.criticCols = [...new Set(state.wines.flatMap(w => w._notes.map(n => n.critic)))];
  } catch {
    document.getElementById('wineGrid').innerHTML =
      '<div class="col-span-full text-red-400 text-sm py-12 text-center">Impossible de charger les données.</div>';
    return;
  }

  computeKPIs(state.wines);
  initFilters(state.wines);
  renderRecentNotes(state.wines);
  renderGrid();
  initAdminPanel();
  initNewsView();
  applyStockFeature();

  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    state.filters.search = e.target.value;
    renderGrid();
  });

  // Score buttons
  document.querySelectorAll('.score-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filters.score = +btn.dataset.score;
      renderGrid();
    });
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', e => {
    state.sort = e.target.value;
    renderGrid();
  });

  // Multi-copy
  document.getElementById('multiCopy').addEventListener('click', () => {
    const lines = [...state.selected].map(i => buildCopyLine(state.wines[i]));
    copyToClipboard(lines.join('\n'));
  });

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Export
  document.getElementById('exportXlsxBtn').addEventListener('click', exportXLSX);

  // Admin panel entry point
  document.getElementById('adminBtn').addEventListener('click', () => {
    const panel = document.getElementById('adminPanel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  });

  // ── Lang toggle ───────────────────────────────────────────────────────────
  document.getElementById('langFr')?.addEventListener('click', () => setLang('fr'));
  document.getElementById('langEn')?.addEventListener('click', () => setLang('en'));
  applyLang();

  // ── Toggle vue grille / liste (desktop uniquement) ────────────────────────
  function enforceGridOnMobile() {
    if (window.innerWidth < 640 && state.view === 'list') {
      state.view = 'grid';
      document.getElementById('viewGrid').classList.add('active');
      document.getElementById('viewList').classList.remove('active');
      renderGrid();
    }
  }
  window.addEventListener('resize', enforceGridOnMobile);

  document.getElementById('viewGrid').addEventListener('click', () => {
    state.view = 'grid';
    document.getElementById('viewGrid').classList.add('active');
    document.getElementById('viewList').classList.remove('active');
    renderGrid();
  });
  document.getElementById('viewList').addEventListener('click', () => {
    if (window.innerWidth < 640) return; // désactivé sur mobile
    state.view = 'list';
    document.getElementById('viewList').classList.add('active');
    document.getElementById('viewGrid').classList.remove('active');
    renderGrid();
  });

  // ── Sidebar mobile toggle ──────────────────────────────────────────────────
  const sidebar   = document.getElementById('sidebar');
  const backdrop  = document.getElementById('sidebarBackdrop');
  const toggleBtn = document.getElementById('sidebarToggle');

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);

  // Close sidebar on filter interaction (mobile UX)
  sidebar.querySelectorAll('.pays-btn, .fcheck, .avail-check, .score-btn')
    .forEach(el => el.addEventListener('change', () => {
      if (window.innerWidth < 1024) closeSidebar();
    }));
}

// ── Language ──────────────────────────────────────────────────────────────────
function applyLang() {
  // Placeholder search
  document.getElementById('searchInput').placeholder = t('searchPlaceholder');
  // Toast text
  document.querySelector('#toast span').textContent = t('copie');
  // Sidebar section titles
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // Sort select options
  const sel = document.getElementById('sortSelect');
  if (sel) {
    sel.options[0].text = t('meilleurScore');
    sel.options[1].text = t('nomAZ');
    sel.options[2].text = t('domaineAZ');
    sel.options[3].text = t('millesime');
  }
  // Recent notes title
  const rn = document.getElementById('recentNotesTitle');
  if (rn) rn.textContent = t('dernieresNotes');
  const rnAll = document.getElementById('recentNotesAll');
  if (rnAll) rnAll.textContent = t('toutVoir');
  // Modal copy button
  const mcb = document.getElementById('modalCopyBtn');
  if (mcb) mcb.lastChild.textContent = ' ' + t('copierNotes');
  // Multi copy button
  const mc = document.getElementById('multiCopy');
  if (mc) { const sp = mc.querySelector('span'); if (sp) sp.textContent = t('copier'); }
  // Toggle buttons title
  const vg = document.getElementById('viewGrid');
  const vl = document.getElementById('viewList');
  if (vg) vg.title = t('vignettes');
  if (vl) vl.title = t('liste');
  // Lang toggle UI
  const btnFr = document.getElementById('langFr');
  const btnEn = document.getElementById('langEn');
  if (btnFr && btnEn) {
    btnFr.classList.toggle('lang-active', state.lang === 'fr');
    btnEn.classList.toggle('lang-active', state.lang === 'en');
  }
  // Re-render everything
  initFilters(state.wines);
  renderRecentNotes(state.wines);
  renderGrid();
}

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('wt-lang', lang);
  applyLang();
}

window.loadMoreCards = loadMoreCards;
document.addEventListener('DOMContentLoaded', init);
