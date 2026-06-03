'use strict';

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

const META_COLS = new Set([
  'Pays', 'Domaine ou Marque', 'Couleur', 'Nom du vin',
  'Millésime', 'Available', 'Récap rapide pour email', 'date_ajout',
]);

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  wines: [],
  criticCols: [],
  filters: {
    search: '', score: 0,
    pays: 'tous',           // 'tous' or exact pays normalized
    couleur: new Set(),
    domaine: new Set(),
    avail: new Set(),
  },
  sort: 'score',
  selected: new Set(),
  modalIdx: null,
};

// ── CSV parser ────────────────────────────────────────────────────────────────
// Auto-detects delimiter (comma or semicolon) and skips non-header rows
// before the real header row (the one containing 'Pays').
function parseCSV(text) {
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();

  // Detect delimiter from first non-empty line
  const firstLine = t.split('\n').find(l => l.trim()) || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

  // Split a single line respecting quoted fields
  function splitLine(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === sep) { fields.push(cur); cur = ''; }
        else cur += c;
      }
    }
    fields.push(cur);
    return fields;
  }

  const lines = t.split('\n');

  // Find the actual header row — must contain 'Pays' and 'Nom du vin'
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].includes('Pays') && lines[i].includes('Nom du vin')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { headers: [], rows: [] };

  const headers = splitLine(lines[headerIdx]).map(h => h.trim());

  const rows = lines.slice(headerIdx + 1)
    .filter(l => l.trim() && l.replace(/[;,]/g, '').trim()) // skip empty rows
    .map(l => {
      const vals = splitLine(l);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });

  return { headers, rows };
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
    .filter(({ val }) => val !== '');
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
    if (nums.length) { noteCount++; nums.forEach(s => all.push(s.num)); }
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
      <span class="lhs"><span class="dot-stock"></span><input type="checkbox" class="avail-check" value="stock"/> En stock</span>
      <span class="count">${inStock}</span>
    </label>
    <label class="filter-check">
      <span class="lhs"><span class="dot-epuise"></span><input type="checkbox" class="avail-check" value="epuise"/> Épuisé</span>
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
function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]);
  return new Date(str);
}

function renderRecentNotes(wines) {
  const el = document.getElementById('recentNotes');
  const dated = wines
    .filter(w => w['date_ajout'] && w['date_ajout'].trim())
    .sort((a, b) => parseDate(b['date_ajout']) - parseDate(a['date_ajout']))
    .slice(0, 5);

  if (!dated.length) {
    el.innerHTML = '<div class="text-xs text-slate-400 italic py-2">Aucune note récente renseignée.</div>';
    return;
  }

  el.innerHTML = dated.map((w, i) => {
    const colorClass = colorCssClass(w['Couleur']);
    const nums = getNumericScores(w).sort((a, b) => b.num - a.num);
    const top = nums[0];
    const abbrev = top ? (CRITIC_ABBREV[top.col] || top.col) : '';
    const pays = norm(w['Pays']);
    const countryCode = COUNTRY_CODE[pays] || '';
    const idx = state.wines.indexOf(w);
    return `
      <div class="recent-card ${colorClass}" data-idx="${idx}" style="border-left-width:3px">
        <div style="flex:1;min-width:0">
          <div class="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">${(w['Domaine ou Marque'] || '').trim()} · ${countryCode}</div>
          <div class="text-sm font-bold text-slate-900 leading-tight truncate">${w['Nom du vin'] || ''}</div>
          <div class="text-xs text-slate-400">${w['Millésime'] || ''}</div>
          <div class="text-[10px] text-slate-300 mt-1">${w['date_ajout'] || ''}</div>
        </div>
        ${top ? `<div style="text-align:right;flex-shrink:0">
          <div class="big-score">${Math.round(top.num)}</div>
          <div class="score-critic">${abbrev}</div>
        </div>` : ''}
      </div>`;
  }).join('');

  el.querySelectorAll('.recent-card').forEach(card => {
    card.addEventListener('click', () => openModal(+card.dataset.idx));
  });
}

// ── Filtering & sorting ───────────────────────────────────────────────────────
function wineMatches(wine) {
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
      // Inclut les noms complets ET les abréviations des critiques ayant une note
      const criticNames = state.criticCols
        .filter(c => wine[c])
        .flatMap(c => [c, CRITIC_ABBREV[c] || '']);
      const hay = [
        wine['Nom du vin'], wine['Domaine ou Marque'], wine['Millésime'],
        ...criticNames
      ].join(' ');
      if (!norm(hay).includes(q)) return false;
    }
  }

  if (f.score > 0 && maxScore(wine) < f.score) return false;

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
function renderScoreBadges(wine) {
  // Only numeric scores, sorted highest → lowest left → right
  const scores = getNumericScores(wine)
    .sort((a, b) => b.num - a.num)
    .slice(0, 6);
  if (!scores.length) return '<span class="text-[10px] text-slate-300 italic">Aucune note</span>';
  return scores.map(({ col, num }) => {
    const abbrev = CRITIC_ABBREV[col] || col;
    const isElite = num > 96;
    const display = Number.isInteger(num) ? num : num.toFixed(1);
    return `<span class="score-badge ${isElite ? 'elite' : ''}">${abbrev} ${display}</span>`;
  }).join('');
}

function renderCard(wine, originalIdx) {
  const colorClass = colorCssClass(wine['Couleur']);
  const stock = isInStock(wine);
  const isSelected = state.selected.has(originalIdx);
  const pays = norm(wine['Pays']);
  const code = COUNTRY_CODE[pays] || '';

  const allScores = getNumericScores(wine).sort((a, b) => b.num - a.num);
  const visible = allScores.slice(0, 5);
  const extra = allScores.length - visible.length;

  const badgesHTML = visible.length
    ? visible.map(({ col, num }) => {
        const abbrev = CRITIC_ABBREV[col] || col;
        const display = Number.isInteger(num) ? num : num.toFixed(1);
        return `<span class="score-badge ${num > 96 ? 'elite' : ''}">${abbrev} ${display}</span>`;
      }).join('') + (extra > 0 ? `<span style="font-size:.65rem;color:#94a3b8;align-self:center;padding-left:2px">+${extra}</span>` : '')
    : '<span style="font-size:.65rem;color:#cbd5e1;font-style:italic">Aucune note</span>';

  return `
    <div class="wine-card ${colorClass} ${isSelected ? 'selected' : ''}" data-idx="${originalIdx}">
      <div class="card-row-top">
        <span class="card-domaine">${(wine['Domaine ou Marque'] || '').trim()} · ${code}</span>
        <input type="checkbox" class="card-checkbox" data-idx="${originalIdx}" ${isSelected ? 'checked' : ''} />
      </div>
      <div class="card-name">${wine['Nom du vin'] || ''}</div>
      <div class="card-vintage">${wine['Millésime'] || '—'}</div>
      <div class="card-badges">${badgesHTML}</div>
      <div class="card-footer">
        <span class="stock-pill ${stock ? 'en' : 'ep'}">
          <span class="stock-dot" style="background:${stock ? '#10b981' : '#cbd5e1'}"></span>
          ${stock ? 'En stock' : 'Épuisé'}
        </span>
        <button class="card-copy-btn" data-idx="${originalIdx}" title="Copier les notes">
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// ── Grid (with progressive rendering for performance) ─────────────────────────
const PAGE_SIZE = 60;
let currentPage = 1;
let lastFiltered = [];

function bindCardEvents(cards) {
  cards.forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-checkbox') || e.target.closest('.card-copy-btn')) return;
      openModal(+card.dataset.idx);
    });
  });
}

function renderGrid() {
  currentPage = 1;
  lastFiltered = sortWines(state.wines.filter(wineMatches));
  const grid = document.getElementById('wineGrid');
  const countEl = document.getElementById('resultCount');

  countEl.textContent = `Tous les vins trouvés (${lastFiltered.length})`;

  if (!lastFiltered.length) {
    grid.innerHTML = '<div class="col-span-full text-sm text-slate-400 py-16 text-center">Aucun vin ne correspond aux filtres.</div>';
    return;
  }

  const page = lastFiltered.slice(0, PAGE_SIZE);
  grid.innerHTML = page.map(w => renderCard(w, state.wines.indexOf(w))).join('');
  if (lastFiltered.length > PAGE_SIZE) {
    const sentinel = document.createElement('div');
    sentinel.id = 'loadMore';
    sentinel.className = 'col-span-full flex justify-center py-6';
    sentinel.innerHTML = `<button onclick="loadMoreCards()" class="text-xs text-slate-500 border border-slate-200 hover:border-slate-400 px-5 py-2 rounded-full transition-colors">
      Voir plus (${lastFiltered.length - PAGE_SIZE} restants)
    </button>`;
    grid.appendChild(sentinel);
  }
  bindCardEvents(grid.querySelectorAll('.wine-card'));

  bindCardListeners(grid);
}

function bindCardListeners(container) {
  container.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const idx = +cb.dataset.idx;
      if (cb.checked) state.selected.add(idx);
      else state.selected.delete(idx);
      cb.closest('.wine-card').classList.toggle('selected', cb.checked);
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

function loadMoreCards() {
  currentPage++;
  const grid = document.getElementById('wineGrid');
  const sentinel = document.getElementById('loadMore');
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = currentPage * PAGE_SIZE;
  const batch = lastFiltered.slice(start, end);

  const frag = document.createDocumentFragment();
  batch.forEach(w => {
    const div = document.createElement('div');
    div.innerHTML = renderCard(w, state.wines.indexOf(w));
    const card = div.firstElementChild;
    card.addEventListener('click', e => {
      if (e.target.closest('.card-checkbox') || e.target.closest('.card-copy-btn')) return;
      openModal(+card.dataset.idx);
    });
    frag.appendChild(card);
  });

  if (sentinel) {
    grid.removeChild(sentinel);
    if (end < lastFiltered.length) {
      const newSentinel = document.createElement('div');
      newSentinel.id = 'loadMore';
      newSentinel.className = 'col-span-full flex justify-center py-6';
      newSentinel.innerHTML = `<button onclick="loadMoreCards()" class="text-xs text-slate-500 border border-slate-200 hover:border-slate-400 px-5 py-2 rounded-full transition-colors">
        Voir plus (${lastFiltered.length - end} restants)
      </button>`;
      grid.appendChild(frag);
      grid.appendChild(newSentinel);
    } else {
      grid.appendChild(frag);
    }
  }

  bindCardListeners(grid);
}

// ── Multi-select bar ──────────────────────────────────────────────────────────
function updateMultiBar() {
  const bar = document.getElementById('multiBar');
  const n = state.selected.size;
  if (n > 0) {
    document.getElementById('multiCount').textContent =
      `${n} vin${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''} pour l'envoi`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
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

  // Scores
  const scores = getScores(wine).sort((a, b) => {
    const na = parseFloat(a.val), nb = parseFloat(b.val);
    if (!isNaN(na) && !isNaN(nb)) return nb - na;
    return 0;
  });

  document.getElementById('modalScores').innerHTML = scores.length
    ? `<div class="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-2">Notes des critiques</div>
       <div>${scores.map(({ col, val }) => {
         const abbrev = CRITIC_ABBREV[col] || col;
         const num = parseFloat(val);
         const elite = !isNaN(num) && num > 96;
         return `<div class="modal-score-row">
           <span class="modal-critic-name">${col} <span class="text-slate-400 text-xs">(${abbrev})</span></span>
           <span class="modal-score-val ${elite ? 'elite' : ''}">${val}</span>
         </div>`;
       }).join('')}</div>`
    : '<div class="text-sm text-slate-400 italic">Aucune note renseignée.</div>';

  // Récap
  const recap = wine['Récap rapide pour email'];
  document.getElementById('modalRecap').innerHTML = recap
    ? `<div class="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-2">Récap email</div>
       <div class="text-sm text-slate-600 font-mono bg-slate-50 rounded-lg px-3 py-2">${recap}</div>`
    : '';

  // Stock
  document.getElementById('modalStock').innerHTML = stock
    ? '<span class="text-xs font-semibold text-emerald-600">● En stock</span>'
    : '<span class="text-xs font-semibold text-slate-400">○ Épuisé</span>';

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
function exportCSV() {
  fetch('data.csv')
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'wine-awards-lurton.csv' });
      a.click();
      URL.revokeObjectURL(url);
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  let text;
  try {
    const res = await fetch('data.csv');
    if (!res.ok) throw new Error();
    text = await res.text();
  } catch {
    document.getElementById('wineGrid').innerHTML =
      '<div class="col-span-full text-red-400 text-sm py-12 text-center">Impossible de charger data.csv.</div>';
    return;
  }

  const { headers, rows } = parseCSV(text);
  state.criticCols = headers.filter(h => !META_COLS.has(h) && h !== '');
  // Filtre strict : seuls les pays connus sont acceptés (évite les lignes décalées ou corrompues)
  const VALID_PAYS = new Set(['france', 'argentine', 'espagne', 'chili']);
  state.wines = rows.filter(w => VALID_PAYS.has((w['Pays'] || '').trim().toLowerCase()));

  computeKPIs(state.wines);
  initFilters(state.wines);
  renderRecentNotes(state.wines);
  renderGrid();

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
  document.getElementById('exportBtn').addEventListener('click', exportCSV);

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

document.addEventListener('DOMContentLoaded', init);
