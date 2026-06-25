'use strict';
/* ============================================================
   Orquestrador de renderização. Cada área tem seu render* nos
   arquivos próprios (search.js, boxes.js); aqui só coordenamos.
   ============================================================ */
function render() {
  renderResults();
  renderBoxes();
  updateCounts();
}

function updateCounts() {
  const ni = $('count-itens'); if (ni) ni.textContent = (state.items || []).length;
  const nb = $('count-caixas'); if (nb) nb.textContent = (state.boxes || []).length;
}
