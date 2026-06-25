'use strict';
/* ============================================================
   Histórico de movimentações (item movido / cadastrado / excluído).
   Log append-only, SINCRONIZADO (união por id, com teto LOG_MAX e
   corte por meta.logClearedAt). Mostrado na tela Caixas. Útil ao
   reorganizar: "Broca 6mm movida de C-01 → C-03".
   ============================================================ */
const LOG_MAX = 200;

/* rótulo legível de uma caixa por id (ou estados especiais). */
function boxLabelById(id) {
  if (!id) return '(sem caixa)';
  const b = boxById(id);
  return b ? boxTitle(b) : '(caixa removida)';
}

/* registra um evento no log; chamado por items.js ao salvar/excluir. */
function logEvent(kind, item, from, to) {
  if (!Array.isArray(state.log)) state.log = [];
  state.log.push({ id: uid(), ts: Date.now(), kind: kind, itemId: item.id, itemName: (item.name || '').trim(), from: from || '', to: to || '' });
  if (state.log.length > LOG_MAX) state.log = state.log.slice(-LOG_MAX);
}

/* texto do evento (HTML escapado). */
function logText(ev) {
  const nm = `<b>${escapeHtml(ev.itemName || 'item')}</b>`;
  if (ev.kind === 'move') return `${nm} movido de ${escapeHtml(ev.from)} → ${escapeHtml(ev.to)}`;
  if (ev.kind === 'add') return `${nm} cadastrado em ${escapeHtml(ev.to || '(sem caixa)')}`;
  if (ev.kind === 'remove') return `${nm} excluído${ev.from ? ' de ' + escapeHtml(ev.from) : ''}`;
  return nm;
}
function logIcon(kind) { return kind === 'add' ? 'plus' : kind === 'remove' ? 'trash-2' : 'refresh-cw'; }

function fmtWhen(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderHistory() {
  const box = $('hist-list'); if (!box) return;
  const log = (state.log || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 60);
  if (!log.length) { box.innerHTML = `<li class="empty-list">Sem movimentações ainda.</li>`; return; }
  box.innerHTML = log.map((ev) => `<li class="hist-row hist-${ev.kind}">
    <span class="hist-ic" aria-hidden="true">${icon(logIcon(ev.kind), 16)}</span>
    <span class="hist-main"><span class="hist-txt">${logText(ev)}</span><span class="hist-when">${escapeHtml(fmtWhen(ev.ts))}</span></span>
  </li>`).join('');
}

/* limpar: corta tudo até agora em TODOS os aparelhos (meta.logClearedAt, last-write-wins). */
function clearHistory() {
  if (!(state.log && state.log.length)) { toast('Nada no histórico.'); return; }
  if (!confirm('Limpar o histórico de movimentações? (Some em todos os aparelhos)')) return;
  state.log = [];
  state.meta.logClearedAt = Date.now();
  touchProfile(); saveState();
  renderHistory();
  toast('Histórico limpo.');
}

function setupHistoryUI() {
  const c = $('hist-clear'); if (c) c.addEventListener('click', clearHistory);
  renderHistory();
}
