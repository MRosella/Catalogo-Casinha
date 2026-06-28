'use strict';
/* ============================================================
   Fotos fora do estado sincronizado.
   Cada foto é endereçada por CONTEÚDO (ref = hash) e guardada:
   - local: store IndexedDB 'photos' (ref -> dataURL)  [ver js/idb.js]
   - remoto: arquivo photos/<ref>.jpg no repo de sync  [ver js/sync.js]
   O item guarda só { ref, w, h }, então o catalogo.json não cresce com
   a coleção. Leitura é retrocompatível com o legado { data, w, h }.
   ============================================================ */

/* ---- ref por conteúdo (determinístico entre aparelhos) ---- */
async function photoRef(dataUrl) {
  const s = String(dataUrl || '');
  const i = s.indexOf(',');
  const payload = i >= 0 ? s.slice(i + 1) : s;     // só o base64 (ignora o prefixo data:)
  try {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      const arr = Array.from(new Uint8Array(buf));
      return 'p' + arr.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    }
  } catch (e) { /* sem crypto.subtle (ex.: file:// nos testes) → fallback */ }
  return 'p' + photoHashJs(payload);
}
/* Fallback puro (sem WebCrypto): FNV-1a 32 bits em dois fluxos → 16 hex (~64 bits). */
function photoHashJs(str) {
  let h1 = 0x811c9dc5, h2 = (0x811c9dc5 ^ 0x5bd1e995) >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = (((h1 ^ c) >>> 0) * 0x01000193) >>> 0;
    h2 = (((h2 ^ c) >>> 0) * 0x01000193) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/* ---- cache em memória (limitado, recência simples) ---- */
const PHOTO_MEM_MAX = 80;
const photoMem = new Map();
function photoMemGet(ref) {
  if (!photoMem.has(ref)) return null;
  const v = photoMem.get(ref); photoMem.delete(ref); photoMem.set(ref, v);   // bump recência
  return v;
}
function photoMemSet(ref, dataUrl) {
  if (photoMem.has(ref)) photoMem.delete(ref);
  photoMem.set(ref, dataUrl);
  while (photoMem.size > PHOTO_MEM_MAX) photoMem.delete(photoMem.keys().next().value);
}

/* Grava uma foto nova (dataURL) e devolve { ref, w, h } p/ pôr no item. */
async function savePhoto(dataUrl, w, h) {
  const ref = await photoRef(dataUrl);
  await photoStorePut(ref, dataUrl);
  photoMemSet(ref, dataUrl);
  return { ref: ref, w: w || 0, h: h || 0 };
}

/* Resolve o dataURL de uma foto por ref: memória → store local → baixa do repo. */
async function resolvePhotoSrc(ref) {
  if (!ref) return null;
  const mem = photoMemGet(ref); if (mem) return mem;
  try { const local = await photoStoreGet(ref); if (local) { photoMemSet(ref, local); return local; } }
  catch (e) { /* ignora; tenta remoto */ }
  try {
    if (typeof isSyncConfigured === 'function' && isSyncConfigured() && navigator.onLine) {
      const data = await ghGetPhoto(loadSyncCfg(), ref);
      if (data) { await photoStorePut(ref, data); photoMemSet(ref, data); return data; }
    }
  } catch (e) { console.warn('resolvePhotoSrc: download falhou', ref, e); }
  return null;
}

/* Carrega sob demanda os thumbnails: cada placeholder [data-pref] vira <img>
   quando entra na viewport (IntersectionObserver). Evita carregar tudo de uma vez. */
let _photoIO = null;
function hydratePhotos(container) {
  const root = container || document;
  const nodes = root.querySelectorAll('[data-pref]');
  if (!nodes.length) return;
  const load = (el) => {
    if (el._phDone) return; el._phDone = true;
    const ref = el.getAttribute('data-pref'); if (!ref) return;
    resolvePhotoSrc(ref).then((src) => {
      if (!src || !el.parentNode) return;   // offline/sem cache: mantém o placeholder
      const img = new Image();
      img.className = 'it-thumb'; img.alt = '';
      img.src = src;
      el.replaceWith(img);
    }).catch(() => { el._phDone = false; });
  };
  if ('IntersectionObserver' in window) {
    if (!_photoIO) _photoIO = new IntersectionObserver((entries, obs) => {
      for (const en of entries) if (en.isIntersecting) { obs.unobserve(en.target); load(en.target); }
    }, { rootMargin: '200px' });
    nodes.forEach((el) => _photoIO.observe(el));
  } else {
    nodes.forEach(load);
  }
}

/* Conjunto de refs em uso pelos itens do estado atual (fila de upload + base do GC). */
function referencedRefs() {
  const set = new Set();
  for (const it of (state.items || [])) if (it.photo && it.photo.ref) set.add(it.photo.ref);
  return set;
}

/* Migração local idempotente: move fotos inline (legado { data }) p/ o store
   'photos' e troca por { ref, w, h }. Roda no init e após importar backup.
   Bump de updatedAt p/ a versão com ref vencer o merge sobre cópias inline antigas. */
async function migrateLocalPhotos() {
  let changed = false;
  const now = Date.now();
  for (const it of (state.items || [])) {
    const p = it.photo;
    if (p && p.data && !p.ref) {
      try {
        const ref = await photoRef(p.data);
        await photoStorePut(ref, p.data);
        photoMemSet(ref, p.data);
        it.photo = { ref: ref, w: p.w || 0, h: p.h || 0 };
        it.updatedAt = now;
        changed = true;
      } catch (e) { console.warn('migrateLocalPhotos: item', it.id, e); }
    }
  }
  if (changed) { touchDoc(); saveState(); render(); }
  return changed;
}
