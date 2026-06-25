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

/* ---------------- Deep-link: #box=<id> (vindo do QR da caixa) ---------------- */
function handleHash() {
  const m = /^#box=(.+)$/.exec(location.hash || '');
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  if (boxById(id)) { showView('caixas'); openBoxDetail(id); }
  // limpa o hash p/ não reabrir ao navegar
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
}

/* ---------------- Inicialização ---------------- */
async function init() {
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

  // sincronização inicial e ao reconectar/voltar o foco
  if (isSyncConfigured() && navigator.onLine) syncNow(true);
  window.addEventListener('online', () => { if (isSyncConfigured()) syncNow(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSyncConfigured() && navigator.onLine) syncNow(true);
  });

  handleHash();
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
