'use strict';

/* ============================================================
   Catálogo da Casinha — inventário de caixas e itens.
   Guarda caixas + itens no aparelho (IndexedDB) e sincroniza
   entre dispositivos por um repositório GitHub privado.
   ============================================================ */

const APP_VERSION = 'v4';                 // manter igual ao CACHE em sw.js
const DB_NAME = 'catalogo-casinha';       // IndexedDB
const STATE_KEY = 'state';                // chave do estado dentro do store 'app'
const THEME_KEY = 'catalogo-casinha-theme-v1';
const SYNC_KEY = 'catalogo-casinha-sync-v1';
const LASTSYNC_KEY = 'catalogo-casinha-lastsync-v1';
const DIRTY_KEY = 'catalogo-casinha-dirty-v1';
const RECENT_KEY = 'catalogo-casinha-recent-v1';   // ids de itens abertos por último (LOCAL, p/ ordenar "Vistos")
const PENDING_BOX_KEY = 'catalogo-casinha-pendingbox';   // deep-link do QR pendente (sessionStorage; sobrevive ao reload do SW)

/* Tamanhos físicos do item (P/M/G) — usados pela sugestão de caixa. */
const SIZES = [
  { v: 'P', label: 'Pequeno' },
  { v: 'M', label: 'Médio' },
  { v: 'G', label: 'Grande' }
];
const SIZE_LABEL = { P: 'Pequeno', M: 'Médio', G: 'Grande' };
const SIZE_ORDER = { P: 0, M: 1, G: 2 };

/* Categorias padrão COM grupo: categorias afins compartilham o mesmo `grupo`
   (ex.: "Material elétrico" e "Cabos e fios" → "Elétrica"), o que faz a sugestão
   de caixa juntar coisas parecidas. Editável em Configurações. */
const DEFAULT_CATEGORIAS = [
  { nome: 'Ferramentas manuais', grupo: 'Ferramentas' },
  { nome: 'Ferramentas elétricas', grupo: 'Ferramentas' },
  { nome: 'Parafusos e fixação', grupo: 'Fixação' },
  { nome: 'Material elétrico', grupo: 'Elétrica' },
  { nome: 'Cabos e fios', grupo: 'Elétrica' },
  { nome: 'Hidráulica', grupo: 'Hidráulica' },
  { nome: 'Jardinagem', grupo: 'Jardinagem' },
  { nome: 'Produtos de limpeza', grupo: 'Limpeza' },
  { nome: 'Pintura', grupo: 'Pintura' },
  { nome: 'Outros', grupo: 'Outros' }
];

function normalizeCatConfig(cfg) {
  const arr = (cfg && Array.isArray(cfg.categorias)) ? cfg.categorias : null;
  const list = (arr && arr.length)
    ? arr.map((c) => ({ nome: String(c.nome || '').trim(), grupo: (c.grupo || c.nome || '').trim() }))
         .filter((c) => c.nome)
    : DEFAULT_CATEGORIAS.map((c) => Object.assign({}, c));
  return { categorias: list.length ? list : DEFAULT_CATEGORIAS.map((c) => Object.assign({}, c)) };
}
function getCatConfig() { return (state.config && Array.isArray(state.config.categorias) && state.config.categorias.length) ? state.config.categorias : DEFAULT_CATEGORIAS; }
function getCategorias() { return getCatConfig().map((c) => c.nome); }
function catByName(nome) { return getCatConfig().find((c) => c.nome === nome) || null; }
function grupoDaCategoria(nome) { const c = catByName(nome); return (c && c.grupo) || nome || 'Outros'; }
/* todos os grupos distintos, na ordem da config */
function getGrupos() { const seen = {}, out = []; for (const c of getCatConfig()) { const g = c.grupo || c.nome; if (g && !seen[g]) { seen[g] = 1; out.push(g); } } return out; }

/* ---------------- Estado ---------------- */
function emptyState() {
  return {
    boxes: [],     // { id, code, name, location, note, mainGroup, sizeClass, updatedAt }
    items: [],     // { id, name, boxId, category, size, qty, tags, note, photo:{data,w,h}|null, out:ts|0, loose:bool, updatedAt }  // out>0 = item retirado ("em uso"); loose = guardado solto de propósito (sem caixa)
    // (campo `out` ausente = item está na caixa; não precisa migração em normalizeState)
    log: [],       // histórico de movimentações: { id, ts, kind:'move'|'add'|'remove', itemId, itemName, from, to }
    config: { categorias: DEFAULT_CATEGORIAS.map((c) => Object.assign({}, c)) },
    tomb: { boxes: {}, items: {} },   // lápides de deleção: id -> ts
    meta: { updatedAt: 0, profileUpdatedAt: 0, logClearedAt: 0 }
  };
}

let state = emptyState();      // preenchido por loadState() no init (assíncrono, vem do IndexedDB)
let applyingRemote = false;    // true enquanto aplicamos dados vindos da nuvem

/* Lê o estado do IndexedDB (fotos ficam embutidas, então não cabe no localStorage). */
async function loadState() {
  try {
    const s = await idbGet(STATE_KEY);
    if (!s) return emptyState();
    return normalizeState(s);
  } catch (e) { console.warn('loadState falhou', e); return emptyState(); }
}

/* Garante a forma do estado (campos ausentes, migrações, updatedAt). */
function normalizeState(s) {
  const base = emptyState();
  const st = Object.assign(base, s);
  st.boxes = (Array.isArray(s.boxes) ? s.boxes : []).map((b) => Object.assign({ updatedAt: Date.now() }, b));
  st.items = (Array.isArray(s.items) ? s.items : []).map((e) => Object.assign({ updatedAt: Date.now() }, e));
  st.log = Array.isArray(s.log) ? s.log : [];
  st.config = normalizeCatConfig(s.config);
  st.tomb = { boxes: (s.tomb && s.tomb.boxes) || {}, items: (s.tomb && s.tomb.items) || {} };
  st.meta = Object.assign({ updatedAt: 0, profileUpdatedAt: 0, logClearedAt: 0 }, s.meta || {});
  return st;
}

/* Grava o estado no IndexedDB (debounce) e agenda a sincronização. */
let _saveTimer = null;
function saveState() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { idbPut(STATE_KEY, state).catch((e) => console.warn('saveState falhou', e)); }, 120);
  if (!applyingRemote) { setDirty(true); scheduleSync(); }
}

function touchDoc() { state.meta.updatedAt = Date.now(); }
function touchProfile() { const t = Date.now(); state.meta.updatedAt = t; state.meta.profileUpdatedAt = t; }

/* ---------------- Acessores ---------------- */
function boxById(id) { return (state.boxes || []).find((b) => b.id === id) || null; }
function itemsInBox(id) { return (state.items || []).filter((e) => e.boxId === id); }

/* ---------------- Utilidades ---------------- */
const $ = (id) => document.getElementById(id);

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function fmtDateBR(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* normaliza texto p/ busca: minúsculas, sem acento */
function normalizeText(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function escapeHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const t = $('toast'); if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* Confirmação no estilo do app (substitui o confirm() nativo).
   Devolve uma Promise<boolean>. Cai no confirm() nativo se faltar o modal. */
let _confirmResolve = null;
function confirmDialog(message, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const m = $('confirm-modal');
    if (!m) { resolve(window.confirm(message)); return; }
    $('confirm-title').textContent = opts.title || 'Confirmar';
    $('confirm-msg').textContent = message || '';
    const yes = $('confirm-yes'), no = $('confirm-no');
    yes.textContent = opts.okText || 'Confirmar';
    no.textContent = opts.cancelText || 'Cancelar';
    yes.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    _confirmResolve = resolve;
    m.classList.add('open');
  });
}
function setupConfirmUI() {
  const m = $('confirm-modal'); if (!m) return;
  const close = (val) => { m.classList.remove('open'); const r = _confirmResolve; _confirmResolve = null; if (r) r(val); };
  $('confirm-yes').addEventListener('click', () => close(true));
  $('confirm-no').addEventListener('click', () => close(false));
  m.addEventListener('click', (e) => { if (e.target === m) close(false); });
}

/* Estado vazio ilustrado (ícone + título + texto + CTA opcional via data-attr,
   tratado por delegação na lista correspondente). */
function emptyStateHtml(iconName, title, desc, dataAttr, btnLabel) {
  const btn = (dataAttr && btnLabel) ? `<button type="button" class="btn btn-primary" ${dataAttr}>${escapeHtml(btnLabel)}</button>` : '';
  return `<li class="empty-ill"><span class="ill-ic">${icon(iconName, 38)}</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(desc)}</p>${btn}</li>`;
}

/* Formata bytes em unidade legível (p/ a barra de armazenamento). */
function fmtBytes(n) {
  n = n || 0;
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 10 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}

/* ---------------- Ícones (SVG inline, estilo Lucide) ---------------- */
const ICONS = {
  menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'qr-code': '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'
};
function icon(name, size) {
  const p = ICONS[name]; if (!p) return '';
  const s = size || 20;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
function setupIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (el._icon === name) return;
    const sz = parseInt(el.getAttribute('data-size') || '', 10) || 20;
    el.innerHTML = icon(name, sz);
    el._icon = name;
  });
}
