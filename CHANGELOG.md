# Changelog — Catálogo da Casinha

## v2 — 5 melhorias de uso diário
- **Scanner de QR embutido** (`js/scan.js`): botão "Escanear" na tela Caixas abre a câmera e lê a
  etiqueta com `BarcodeDetector` (nativo no Chrome Android), abrindo a caixa direto — fecha o ciclo
  etiquetei → escaneei → achei, sem sair do app. Sem dependência nova; onde o navegador não suporta,
  o botão some e a câmera nativa continua lendo o QR (que é uma URL do app).
- **"Onde guardar?"** (`js/locate.js`): busca reversa da sugestão — escolha categoria+tamanho do
  item na mão e veja a caixa ideal (`suggestBox`) + as outras caixas com o mesmo grupo, com 1 toque
  pra abrir. Não cria item.
- **Badge de ocupação das caixas** (`boxFullness`/`fillChipHtml`): cada caixa na lista mostra
  "N itens / Quase cheia / Lotada" (limiar `SUGGEST_FULL`), ajudando a decidir onde guardar.
- **Ordenação da busca** (`sortResults`) + **"Vistos por último"**: seletor Recentes / Vistos /
  Nome / Categoria; "Vistos" usa uma lista LOCAL de itens abertos (`markViewed`, `-recent-v1`).
- **Histórico de movimentações** (`js/history.js`): registra item movido de caixa, cadastrado e
  excluído ("Broca movida de C-01 → C-03"); card no fim da tela Caixas. Sincroniza (`mergeLog`,
  união por id) e "Limpar" usa `meta.logClearedAt` p/ não ressuscitar no merge.
- Testes atualizados (`parseBoxFromText`, `boxFullness`, `sortResults`, `mergeLog`); harnesses PASS.

## v1 — versão inicial
PWA de inventário da casinha do quintal (caixas + itens), no mesmo molde do app de
Despesas (vanilla JS, sem build, módulos `js/*.js` em escopo global, SW network-first
com cache versionado).

- **Caixas e itens** com CRUD completo (modais), foto comprimida **embutida** no item
  (`item.photo.data`), tamanho P/M/G, quantidade, tags e observação.
- **Busca por texto** (ignora acento/caixa; casa nome, tags, categoria, observação e
  nome/código da caixa) + **filtro por categoria** em chips.
- **Sugestão inteligente de caixa** ao cadastrar (`suggestBox`): heurística local por
  afinidade de **grupo** de categoria + **tamanho** compatível + folga; chip de 1 toque,
  com opção de criar caixa nova já no grupo/tamanho do item.
- **QR + etiquetas imprimíveis**: cada caixa gera uma etiqueta com código, nome e QR
  (`#box=<id>`); a câmera nativa do celular abre o app já na caixa (deep-link `handleHash`).
- **Sincronização entre aparelhos** por repositório GitHub privado (`catalogo.json`),
  merge last-write-wins + lápides; **backup** export/import em `.json`.
- **Estado no IndexedDB** (fotos embutidas não cabem no localStorage); `init` renderiza a
  UI antes de esperar o carregamento.
- **Categorias com grupo** editáveis; tema claro/escuro; offline-first (PWA instalável).
- Harnesses de teste `tests/integrity.html` e `tests/logic.html` (PASS headless).
