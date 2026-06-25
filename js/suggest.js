'use strict';
/* ============================================================
   Sugestão inteligente de caixa (heurística local, sem IA).
   Ao cadastrar um item, sugere a caixa mais apropriada juntando
   itens de GRUPO de categoria parecido e TAMANHO compatível, sem
   misturar item minúsculo com item grande nem encher demais.
   ============================================================ */

/* Resume o que uma caixa já contém (+ campos declarados mainGroup/sizeClass). */
function boxProfile(box) {
  const items = itemsInBox(box.id);
  const groupCount = {};            // grupo -> nº de itens
  const sizeCount = { P: 0, M: 0, G: 0 };
  for (const it of items) {
    const g = grupoDaCategoria(it.category);
    groupCount[g] = (groupCount[g] || 0) + 1;
    if (it.size && sizeCount[it.size] != null) sizeCount[it.size]++;
  }
  let domGroup = box.mainGroup || '', best = 0;
  for (const g in groupCount) if (groupCount[g] > best) { best = groupCount[g]; domGroup = g; }
  let domSize = box.sizeClass || '', bs = 0;
  for (const s of ['P', 'M', 'G']) if (sizeCount[s] > bs) { bs = sizeCount[s]; domSize = s; }
  return { count: items.length, groupCount, sizeCount, domGroup, domSize };
}

/* Compatibilidade de tamanho: 1 igual · 0.3 vizinho · -1 extremos opostos (P×G).
   Desconhecido (caixa vazia/sem tamanho) = 0 (neutro). */
function sizeCompat(a, b) {
  if (!a || !b) return 0;
  const d = Math.abs(SIZE_ORDER[a] - SIZE_ORDER[b]);
  if (d === 0) return 1;
  if (d === 1) return 0.3;
  return -1;
}

const SUGGEST_FULL = 25;        // a partir daqui a caixa é considerada cheia
const SUGGEST_THRESHOLD = 60;   // abaixo disto, recomenda criar nova caixa

/* Pontua cada caixa p/ o item e devolve a melhor (ou createNew). */
function suggestBox(item) {
  const grupo = grupoDaCategoria(item.category);
  let best = null, bestScore = -Infinity;
  for (const box of (state.boxes || [])) {
    const prof = boxProfile(box);
    if (prof.count === 0 && !box.mainGroup) continue;   // caixa vazia sem grupo declarado: ignora
    let score = 0;
    // afinidade de grupo (peso alto)
    if (prof.domGroup === grupo) score += 100;
    else if (prof.groupCount[grupo]) score += 60;       // já tem algum item desse grupo
    // compatibilidade de tamanho (peso médio)
    score += sizeCompat(item.size, prof.domSize) * 40;
    // folga (peso baixo): penaliza caixa cheia p/ distribuir
    if (prof.count > SUGGEST_FULL) score -= (prof.count - SUGGEST_FULL) * 2;
    if (score > bestScore) { bestScore = score; best = { box, prof, score }; }
  }
  if (best && best.score >= SUGGEST_THRESHOLD) {
    return { box: best.box, score: best.score, createNew: false, reason: suggestReason(best, grupo, item.size) };
  }
  return {
    box: null, score: best ? best.score : 0, createNew: true,
    newSeed: { mainGroup: grupo, sizeClass: item.size || '' },
    reason: 'Nenhuma caixa combina bem — vale criar uma nova caixa de ' + grupo + '.'
  };
}

/* Texto curto explicando a sugestão. */
function suggestReason(best, grupo, size) {
  const parts = [];
  const n = best.prof.groupCount[grupo] || 0;
  if (best.prof.domGroup === grupo && n) parts.push('já tem ' + n + ' de ' + grupo.toLowerCase());
  else if (n) parts.push('tem ' + n + ' de ' + grupo.toLowerCase());
  else parts.push('grupo ' + grupo);
  const sc = sizeCompat(size, best.prof.domSize);
  if (sc >= 1) parts.push('tamanho compatível');
  else if (sc < 0) parts.push('atenção: tamanhos diferentes');
  return parts.join(', ');
}
