'use strict';
/* ============================================================
   Tema, inicialização, Service Worker, conectividade e deep-link.
   Carregado por último (todas as funções já estão definidas).
   ============================================================ */

/* ---------------- Modo escuro ---------------- */
function currentTheme() {
  const p = localStorage.getItem(THEME_KEY);
  if (p === 'dark' || p === 'light') return p;
  return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme() {
  const t = currentTheme();
  document.documentElement.setAttribute('data-theme', t);
  const btn = $('theme-toggle');
  if (btn) { btn.innerHTML = icon(t === 'dark' ? 'sun' : 'moon', 22); btn.title = t === 'dark' ? 'Tema claro' : 'Tema escuro'; }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#1b231d' : '#2f7d4f');
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme();
}
function setupTheme() {
  applyTheme();
  if ($('theme-toggle')) $('theme-toggle').addEventListener('click', toggleTheme);
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!localStorage.getItem(THEME_KEY)) applyTheme(); }); } catch (e) {}
  }
}

/* ---------------- Deep-link: #box=<id> (vindo do QR da caixa) ----------------
   O SW usa skipWaiting()+clients.claim() e recarrega a página em controllerchange
   (setupServiceWorker). Na 1ª abertura vinda do QR esse reload dispara DEPOIS do
   handleHash limpar o hash → o deep-link se perdia e caíamos na tela Buscar.
   Solução: gravar o id em sessionStorage (sobrevive ao reload da mesma aba) já no
   topo do init e só consumir após carregar o estado; limpar ao fechar a caixa. */
function pendingBox() { try { return sessionStorage.getItem(PENDING_BOX_KEY) || ''; } catch (e) { return ''; } }
function setPendingBox(id) { try { id ? sessionStorage.setItem(PENDING_BOX_KEY, id) : sessionStorage.removeItem(PENDING_BOX_KEY); } catch (e) {} }

/* Ação pendente dos atalhos do PWA (#new=item / #scan), mesmo padrão do #box=. */
function pendingAct() { try { return sessionStorage.getItem(PENDING_ACT_KEY) || ''; } catch (e) { return ''; } }
function setPendingAct(a) { try { a ? sessionStorage.setItem(PENDING_ACT_KEY, a) : sessionStorage.removeItem(PENDING_ACT_KEY); } catch (e) {} }

/* Síncrono, chamado no INÍCIO do init (antes do SW poder recarregar): captura o
   alvo do hash (#box=<id>, #new=item ou #scan), guarda em sessionStorage e limpa a URL. */
function captureDeepLink() {
  const h = location.hash || '';
  const m = /^#box=(.+)$/.exec(h);
  if (m) setPendingBox(decodeURIComponent(m[1]));
  else if (h === '#new=item' || h === '#scan') setPendingAct(h.slice(1));
  else return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
}

/* Chamado APÓS loadState(): abre a caixa pendente (se existir). Não remove a chave
   aqui — deixa sobreviver a um eventual reload do SW; limpa só ao fechar a caixa
   (closeBoxDetail) ou se o id não corresponder a nenhuma caixa. Ações dos atalhos
   do PWA são consumidas de uma vez (abrir modal / scanner não precisa sobreviver). */
function consumeDeepLink() {
  const id = pendingBox();
  if (id) {
    if (boxById(id)) { showView('caixas'); openBoxDetail(id); }
    else setPendingBox('');
    return;
  }
  const act = pendingAct();
  if (!act) return;
  setPendingAct('');
  if (act === 'new=item') openItemModal(null);
  else if (act === 'scan') { showView('caixas'); if (scanSupported()) startScan(); }
}

/* Navegação por hash já com o app aberto (#box=<id>, #new=item, #scan). */
function handleHash() {
  const h = location.hash || '';
  const m = /^#box=(.+)$/.exec(h);
  if (m) setPendingBox(decodeURIComponent(m[1]));
  else if (h === '#new=item' || h === '#scan') setPendingAct(h.slice(1));
  else return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  consumeDeepLink();
}

/* ---------------- Inicialização ---------------- */
async function init() {
  captureDeepLink();   // guarda o alvo do QR ANTES do SW poder recarregar a página
  setupTheme();
  setupIcons();

  // 1) liga os controles e mostra a UI (vazia) já — não espera o IndexedDB,
  //    pra nunca ficar em branco se o carregamento do estado demorar.
  setupNav();
  setupSearchUI();
  setupBoxUI();
  setupItemUI();
  setupScanUI();
  setupLocateUI();
  setupHistoryUI();
  setupCatUI();
  setupSyncUI();
  setupBackupUI();
  setupConfirmUI();
  setupStorageUI();
  setupServiceWorker();
  setupConnectivity();
  updateFooter();
  updateSyncIndicator();
  populateCategorySelects();
  render();
  if ($('sync-ind')) $('sync-ind').addEventListener('click', () => syncNow(false));

  // 2) carrega o estado salvo (IndexedDB) e re-renderiza com os dados.
  try { state = await loadState(); } catch (e) { console.warn('loadState falhou', e); }
  populateCategorySelects();
  render();

  // migra fotos inline (legado) p/ o store 'photos' antes do 1º sync (idempotente)
  try { await migrateLocalPhotos(); } catch (e) { console.warn('migrateLocalPhotos falhou', e); }

  // sincronização inicial e ao reconectar/voltar o foco
  if (isSyncConfigured() && navigator.onLine) syncNow(true);
  window.addEventListener('online', () => { if (isSyncConfigured()) syncNow(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSyncConfigured() && navigator.onLine) syncNow(true);
  });

  consumeDeepLink();   // abre a caixa pendente (do QR) agora que o estado carregou
  window.addEventListener('hashchange', handleHash);
}

/* ---------------- Service Worker (auto-atualização) ---------------- */
function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update();
    setInterval(() => reg.update(), 60000);
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; window.location.reload(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => { if (r) r.update(); });
  });
}

/* ---------------- Aviso de offline ---------------- */
function setupConnectivity() {
  if (!navigator.onLine) showOfflineNotice();
  window.addEventListener('offline', () => { showOfflineNotice(); updateSyncIndicator(); });
  window.addEventListener('online', () => { const n = $('offline-notice'); if (n) n.remove(); updateSyncIndicator(); });
}
function showOfflineNotice() {
  if ($('offline-notice')) return;
  const div = document.createElement('div');
  div.id = 'offline-notice'; div.className = 'offline-notice';
  div.innerHTML = `<div class="offline-card"><div class="offline-icon">📡</div>
    <h3>Você está offline</h3>
    <p>O app continua funcionando; a sincronização volta quando a conexão retornar.</p>
    <button class="btn btn-primary" id="offline-ok">Entendi</button></div>`;
  document.body.appendChild(div);
  $('offline-ok').addEventListener('click', () => div.remove());
}

document.addEventListener('DOMContentLoaded', init);
