'use strict';
/* ============================================================
   Sincronização entre dispositivos (repositório PRIVADO no GitHub).
   Lê/grava um único arquivo catalogo.json via API do GitHub.
   O token fica salvo só neste aparelho (localStorage). Adaptado do
   app de Despesas: merge por id, last-write-wins + lápides.
   ============================================================ */
const GH_API = 'https://api.github.com';
const DATA_PATH = 'catalogo.json';

function loadSyncCfg() {
  try { return Object.assign({ repo: '', token: '' }, JSON.parse(localStorage.getItem(SYNC_KEY) || '{}')); }
  catch (e) { return { repo: '', token: '' }; }
}
function saveSyncCfg(cfg) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); } catch (e) { console.warn('saveSyncCfg falhou', e); } }
function isSyncConfigured() { const c = loadSyncCfg(); return !!(c.repo && c.token); }

function setDirty(v) { try { v ? localStorage.setItem(DIRTY_KEY, '1') : localStorage.removeItem(DIRTY_KEY); } catch (e) {} updateSyncIndicator(); }
function isDirty() { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; } }
function setLastSync(ts) { try { localStorage.setItem(LASTSYNC_KEY, String(ts)); } catch (e) {} }
function getLastSync() { try { return localStorage.getItem(LASTSYNC_KEY); } catch (e) { return null; } }

function updateFooter() {
  const v = $('ft-version'); if (v) v.textContent = 'App ' + APP_VERSION;
  const ls = $('ft-lastsync'); if (!ls) return;
  const t = getLastSync();
  ls.textContent = 'Última sincronização: ' + (t ? new Date(Number(t)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
}

function setSyncStatus(msg, kind) {
  const el = $('sy-status'); if (!el) return;
  el.textContent = msg; el.className = 'sync-status' + (kind ? ' ' + kind : '');
}

/* barra de progresso no cabeçalho: pct numérico mostra/atualiza; null esconde. */
function setSyncProgress(pct) {
  const wrap = $('sync-prog'); if (!wrap) return;
  if (pct == null) { wrap.hidden = true; return; }
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  wrap.hidden = false;
  const fill = $('sync-prog-fill'); if (fill) fill.style.width = p + '%';
  const lbl = $('sync-prog-pct'); if (lbl) lbl.textContent = p + '%';
}

/* ícone no cabeçalho: ✓ sincronizado · ⟳ pendente/sincronizando · ⚠ offline */
function updateSyncIndicator() {
  const el = $('sync-ind'); if (!el) return;
  if (!isSyncConfigured()) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.classList.remove('ok', 'pending', 'offline', 'spin');
  if (!navigator.onLine) { el.innerHTML = icon('alert-triangle', 20); el.classList.add('offline'); el.title = 'Offline'; }
  else if (syncing) { el.innerHTML = icon('refresh-cw', 20); el.classList.add('pending', 'spin'); el.title = 'Sincronizando…'; }
  else if (isDirty()) { el.innerHTML = icon('refresh-cw', 20); el.classList.add('pending'); el.title = 'Alterações pendentes — toque para sincronizar'; }
  else { el.innerHTML = icon('check', 20); el.classList.add('ok'); el.title = 'Sincronizado'; }
}

function ghHeaders(token) {
  return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}
function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob((b64 || '').replace(/\s/g, '')); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function ghGetFile(cfg) {
  const url = `${GH_API}/repos/${cfg.repo}/contents/${DATA_PATH}`;
  const res = await fetch(url, { headers: ghHeaders(cfg.token), cache: 'no-store' });
  if (res.status === 404) return { exists: false, sha: null, data: null };
  if (!res.ok) throw new Error('GitHub ' + res.status + ' — ' + (await res.text()).slice(0, 140));
  const j = await res.json();
  let content = j.content;
  // Arquivos > 1MB: a Contents API devolve content vazio (encoding "none").
  // Com fotos embutidas o catalogo.json passa disso, entao busca o blob pelo
  // sha (Git Blobs API suporta ate 100MB, devolve base64). Sem isso,
  // b64DecodeUtf8('') -> '' -> JSON.parse('') = "Unexpected end of JSON input".
  if (!content || (j.encoding && j.encoding !== 'base64')) {
    const br = await fetch(`${GH_API}/repos/${cfg.repo}/git/blobs/${j.sha}`, { headers: ghHeaders(cfg.token), cache: 'no-store' });
    if (!br.ok) throw new Error('GitHub blob ' + br.status + ' — ' + (await br.text()).slice(0, 140));
    content = (await br.json()).content;
  }
  return { exists: true, sha: j.sha, data: JSON.parse(b64DecodeUtf8(content)) };
}
async function ghPutFile(cfg, dataObj, sha) {
  const url = `${GH_API}/repos/${cfg.repo}/contents/${DATA_PATH}`;
  const body = { message: 'Atualiza catalogo — ' + new Date().toISOString(), content: b64EncodeUtf8(JSON.stringify(dataObj, null, 2)) };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(cfg.token), body: JSON.stringify(body) });
  if (res.status === 409) { const e = new Error('conflito'); e.conflict = true; throw e; }
  if (!res.ok) throw new Error('GitHub ' + res.status + ' — ' + (await res.text()).slice(0, 140));
  return (await res.json()).content.sha;
}
async function ghCheckRepo(cfg) {
  const res = await fetch(`${GH_API}/repos/${cfg.repo}`, { headers: ghHeaders(cfg.token), cache: 'no-store' });
  if (res.status === 404) throw new Error('Repositório não encontrado (confira usuário/repo e se o token tem acesso).');
  if (res.status === 401) throw new Error('Token inválido ou expirado.');
  if (!res.ok) throw new Error('GitHub ' + res.status);
  const j = await res.json();
  if (!j.private) throw new Error('ATENÇÃO: esse repositório é PÚBLICO. Use um repositório privado para seus dados.');
  if (!(j.permissions && (j.permissions.push || j.permissions.admin))) throw new Error('O token não tem permissão de escrita (Contents: Read and write).');
  return j;
}

/* ---- fotos no repo: arquivo por conteúdo em photos/<ref>.jpg ---- */
function photoRepoPath(ref) { return 'photos/' + ref + '.jpg'; }

async function ghPutPhoto(cfg, ref, dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  const content = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;   // base64 do JPEG (sem o prefixo data:)
  const url = `${GH_API}/repos/${cfg.repo}/contents/${photoRepoPath(ref)}`;
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(cfg.token), body: JSON.stringify({ message: 'foto ' + ref, content: content }) });
  if (res.status === 422 || res.status === 409) return true;   // já existe (imutável) → ok
  if (!res.ok) throw new Error('GitHub PUT foto ' + res.status + ' — ' + (await res.text()).slice(0, 140));
  return true;
}
async function ghGetPhoto(cfg, ref) {
  const url = `${GH_API}/repos/${cfg.repo}/contents/${photoRepoPath(ref)}`;
  const res = await fetch(url, { headers: ghHeaders(cfg.token), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub GET foto ' + res.status);
  const j = await res.json();
  let content = j.content;
  if (!content || (j.encoding && j.encoding !== 'base64')) {   // >1MB: pega pelo blob
    const br = await fetch(`${GH_API}/repos/${cfg.repo}/git/blobs/${j.sha}`, { headers: ghHeaders(cfg.token), cache: 'no-store' });
    if (!br.ok) throw new Error('GitHub blob foto ' + br.status);
    content = (await br.json()).content;
  }
  return 'data:image/jpeg;base64,' + (content || '').replace(/\s/g, '');
}
/* Lista os arquivos de photos/ (ref -> sha). Contents API devolve até 1000
   itens (degrada com elegância acima disso); 404 = pasta ainda não existe. */
async function ghListPhotos(cfg) {
  const res = await fetch(`${GH_API}/repos/${cfg.repo}/contents/photos`, { headers: ghHeaders(cfg.token), cache: 'no-store' });
  if (res.status === 404) return {};
  if (!res.ok) throw new Error('GitHub list fotos ' + res.status);
  const arr = await res.json();
  const map = {};
  if (Array.isArray(arr)) for (const f of arr) if (f && f.type === 'file' && /\.jpg$/.test(f.name)) map[f.name.replace(/\.jpg$/, '')] = f.sha;
  return map;
}
async function ghDeletePhoto(cfg, ref, sha) {
  const url = `${GH_API}/repos/${cfg.repo}/contents/${photoRepoPath(ref)}`;
  const res = await fetch(url, { method: 'DELETE', headers: ghHeaders(cfg.token), body: JSON.stringify({ message: 'remove foto orfa ' + ref, sha: sha }) });
  if (res.status === 404 || res.status === 422) return true;   // já sumiu
  if (!res.ok) throw new Error('GitHub DELETE foto ' + res.status);
  return true;
}

/* Reconcilia as fotos com o repo (1 listagem): envia as referenciadas que faltam
   e apaga as órfãs (sem nenhum item dono no doc atual). Roda após o push. */
async function syncPhotos(cfg, onProgress) {
  let repo;
  try { repo = await ghListPhotos(cfg); } catch (e) { console.warn('ghListPhotos falhou', e); if (onProgress) onProgress(1); return; }
  const refs = referencedRefs();
  const uploads = [...refs].filter((ref) => !repo[ref]);   // referenciada, local, ausente do repo
  const deletes = Object.keys(repo).filter((ref) => !refs.has(ref));   // no repo mas sem dono no doc atual
  const total = uploads.length + deletes.length;
  let done = 0;
  const tick = () => { done++; if (onProgress && total) onProgress(done / total); };
  for (const ref of uploads) {
    try { const data = await photoStoreGet(ref); if (data) await ghPutPhoto(cfg, ref, data); }
    catch (e) { console.warn('upload de foto falhou', ref, e); }
    tick();
  }
  for (const ref of deletes) {                          // GC das órfãs
    try { await ghDeletePhoto(cfg, ref, repo[ref]); }
    catch (e) { console.warn('GC de foto falhou', ref, e); }
    tick();
  }
  if (onProgress) onProgress(1);
}

/* ---- documento sincronizado (snapshot + merge) ---- */
function currentDoc() {
  return {
    boxes: (state.boxes || []).map((b) => Object.assign({}, b)),
    items: (state.items || []).map((e) => Object.assign({}, e)),
    log: (state.log || []).map((e) => Object.assign({}, e)),
    config: { categorias: getCatConfig().map((c) => Object.assign({}, c)) },
    tomb: { boxes: Object.assign({}, state.tomb.boxes), items: Object.assign({}, state.tomb.items) },
    meta: Object.assign({ updatedAt: 0, profileUpdatedAt: 0, logClearedAt: 0 }, state.meta)
  };
}

function applyDoc(doc) {
  applyingRemote = true;
  state.boxes = Array.isArray(doc.boxes) ? doc.boxes : [];
  state.items = Array.isArray(doc.items) ? doc.items : [];
  state.log = Array.isArray(doc.log) ? doc.log : [];
  state.config = normalizeCatConfig(doc.config);
  state.tomb = { boxes: (doc.tomb && doc.tomb.boxes) || {}, items: (doc.tomb && doc.tomb.items) || {} };
  state.meta = Object.assign({ updatedAt: 0, profileUpdatedAt: 0, logClearedAt: 0 }, doc.meta || {});
  saveState();
  render();
  populateCategorySelects();
  populateBoxSelects();
  if (typeof renderCatEditor === 'function') { catDraft = null; renderCatEditor(); }
  applyingRemote = false;
}

/* merge de uma lista (boxes|items) por id: last-write-wins + lápides. */
function mergeList(key, a, b, outTomb) {
  const PURGE = Date.now() - 180 * 24 * 3600 * 1000;
  const tomb = {};
  for (const src of [a, b]) { const tm = (src.tomb && src.tomb[key]) || {}; for (const id in tm) if (tm[id] >= PURGE) tomb[id] = Math.max(tomb[id] || 0, tm[id]); }
  const map = {};
  for (const src of [a, b]) for (const e of (src[key] || [])) { const cur = map[e.id]; if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) map[e.id] = e; }
  const list = [];
  for (const id in map) { const e = map[id]; if (tomb[id] && tomb[id] >= (e.updatedAt || 0)) continue; list.push(e); }
  outTomb[key] = tomb;
  return list;
}

/* merge do log (append-only): união por id, corta o que é anterior ao
   logClearedAt e mantém os LOG_MAX mais recentes. */
function mergeLog(a, b, clearedAt) {
  const map = {};
  for (const src of [a, b]) for (const e of (src.log || [])) if (e && e.id) map[e.id] = e;
  let list = Object.keys(map).map((k) => map[k]).filter((e) => (e.ts || 0) > clearedAt);
  list.sort((x, y) => (x.ts || 0) - (y.ts || 0));
  if (list.length > LOG_MAX) list = list.slice(-LOG_MAX);
  return list;
}

function mergeDocs(a, b) {
  const pa = (a.meta && a.meta.profileUpdatedAt) || 0, pb = (b.meta && b.meta.profileUpdatedAt) || 0;
  const p = pb > pa ? b : a;     // config: o mais recente vence
  const out = { config: normalizeCatConfig(p.config), tomb: { boxes: {}, items: {} } };
  out.boxes = mergeList('boxes', a, b, out.tomb);
  out.items = mergeList('items', a, b, out.tomb);
  const clearedAt = Math.max((a.meta && a.meta.logClearedAt) || 0, (b.meta && b.meta.logClearedAt) || 0);
  out.log = mergeLog(a, b, clearedAt);
  out.meta = { updatedAt: Math.max((a.meta && a.meta.updatedAt) || 0, (b.meta && b.meta.updatedAt) || 0), profileUpdatedAt: Math.max(pa, pb), logClearedAt: clearedAt };
  return out;
}

/* ---- orquestração: puxar -> mesclar -> empurrar ---- */
let syncing = false;
function scheduleSync() {
  if (!isSyncConfigured()) return;
  clearTimeout(scheduleSync._t);
  scheduleSync._t = setTimeout(() => { syncNow(true); }, 2500);
}

async function syncNow(silent) {
  const cfg = loadSyncCfg();
  if (!cfg.repo || !cfg.token) { if (!silent) setSyncStatus('Configure o repositório e o token.', 'warn'); return; }
  if (!navigator.onLine) { setSyncStatus('Offline — sincroniza quando a conexão voltar.', 'warn'); updateSyncIndicator(); return; }
  if (syncing) return;
  syncing = true; updateSyncIndicator(); setSyncStatus('Sincronizando…'); setSyncProgress(5);
  try {
    const remote = await ghGetFile(cfg);
    setSyncProgress(20);
    let merged, sha;
    if (!remote.exists) { merged = currentDoc(); sha = null; }
    else { merged = mergeDocs(currentDoc(), remote.data); sha = remote.sha; }
    applyDoc(merged);
    setSyncProgress(35);
    const changed = !remote.exists || JSON.stringify(merged) !== JSON.stringify(remote.data);
    if (changed) {
      try { await ghPutFile(cfg, merged, sha); }
      catch (e) {
        if (e.conflict) { const r2 = await ghGetFile(cfg); const m2 = mergeDocs(currentDoc(), r2.data); applyDoc(m2); await ghPutFile(cfg, m2, r2.sha); }
        else { throw e; }
      }
    }
    setSyncProgress(50);
    try { await syncPhotos(cfg, (f) => setSyncProgress(50 + f * 48)); } catch (e) { console.warn('syncPhotos', e); }   // fotos: não derruba o sync
    setSyncProgress(100);
    setDirty(false); setLastSync(Date.now()); updateFooter();
    setSyncStatus('Sincronizado • ' + new Date().toLocaleString('pt-BR'), 'ok');
  } catch (e) {
    console.error(e);
    setSyncStatus('Erro: ' + e.message + (isDirty() ? ' (alterações pendentes mantidas)' : ''), 'err');
  } finally { syncing = false; updateSyncIndicator(); setTimeout(() => { if (!syncing) setSyncProgress(null); }, 600); }
}

function setupSyncUI() {
  const cfg = loadSyncCfg();
  if ($('sy-repo')) $('sy-repo').value = cfg.repo || '';
  if ($('sy-token')) $('sy-token').value = cfg.token || '';
  if (!isSyncConfigured()) setSyncStatus('Não configurado.', '');
  else setSyncStatus('Configurado. Toque em “Sincronizar agora”.', '');

  function persist() { saveSyncCfg({ repo: ($('sy-repo').value || '').trim(), token: ($('sy-token').value || '').trim() }); updateSyncIndicator(); }
  $('sy-repo').addEventListener('change', persist);
  $('sy-token').addEventListener('change', persist);
  $('sy-test').addEventListener('click', async () => {
    persist(); const c = loadSyncCfg();
    if (!c.repo || !c.token) { setSyncStatus('Preencha o repositório e o token.', 'warn'); return; }
    setSyncStatus('Verificando conexão…');
    try { await ghCheckRepo(c); setSyncStatus('Conectado ✓ Repositório privado acessível.', 'ok'); }
    catch (e) { setSyncStatus('Erro: ' + e.message, 'err'); }
  });
  $('sy-now').addEventListener('click', () => { persist(); syncNow(false); });
  $('sy-clear').addEventListener('click', async () => {
    if (!await confirmDialog('Apagar o token e o repositório salvos neste aparelho? Os dados locais permanecem.', { okText: 'Apagar', danger: true })) return;
    try { localStorage.removeItem(SYNC_KEY); } catch (e) {}
    $('sy-repo').value = ''; $('sy-token').value = '';
    setSyncStatus('Desconectado deste aparelho.', ''); updateSyncIndicator();
    toast('Sincronização desativada neste aparelho.');
  });
}
