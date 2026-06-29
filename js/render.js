'use strict';
/* ============================================================
   Orquestrador de renderização. Cada área tem seu render* nos
   arquivos próprios (search.js, boxes.js); aqui só coordenamos.
   ============================================================ */
function render() {
  renderResults();
  renderBoxes();
  if (typeof renderStats === 'function') renderStats();
  if (typeof renderHistory === 'function') renderHistory();
  updateCounts();
}

function updateCounts() {
  const ni = $('count-itens'), nItems = (state.items || []).length;
  if (ni) { ni.textContent = nItems; ni.style.display = nItems ? '' : 'none'; }
  const nb = $('count-caixas'), nBoxes = (state.boxes || []).length;
  if (nb) { nb.textContent = nBoxes; nb.style.display = nBoxes ? '' : 'none'; }
}
