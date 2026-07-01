# Changelog — Catálogo da Casinha

## v11 — 8 melhorias visuais e de função
- **Cor por grupo** (`groupClass` em `js/core.js` + paleta `.grp-0..7`): thumb do card da
  caixa, badge da caixa no item e pontinho nos chips de categoria ganham uma cor estável
  por grupo (hash do nome) — a lista fica escaneável de relance, nos dois temas.
- **Modo grade na busca** (`applySearchView`, botão na barra de ordenação): alterna
  lista ↔ grade 2–3 colunas com foto grande (persiste local em `-viewmode-v1`); swipe de
  excluir desativado na grade (exclui pelo modal).
- **Filtro dentro da caixa** (`#bd-filter`/`renderBoxDetailItems`): campo de busca no
  detalhe da caixa (aparece com >8 itens), com realce do termo.
- **"Você quis dizer…?"** (`didYouMean`): busca sem resultado sugere o item de nome/tag
  mais parecido (reusa `nameSimilarity`); 1 toque refaz a busca.
- **Lista de compras** (`shoppingListText`/`shareShoppingList`): com o filtro "Estoque
  baixo" ativo, chip "Compartilhar lista" gera o texto e usa Web Share (ou copia).
- **Histórico do item** (`renderItemHistory`): modal de edição mostra as últimas 5
  movimentações daquele item (reusa `logText`/`fmtWhen`).
- **Lanterna no scanner** (`toggleTorch` em `js/scan.js`): botão de torch no overlay
  quando a câmera suporta (`getCapabilities().torch`).
- **Compartilhar caixa** (`shareBox`): botão no detalhe compartilha o link `#box=<id>`
  (Web Share; fallback copiar). **Atalhos do PWA** no manifest ("Novo item"/"Escanear",
  `#new=item`/`#scan` tratados em `js/main.js` no mesmo padrão do deep-link do QR).
- Testes atualizados (`groupClass`, `didYouMean`, `shoppingListText` + integridade); PASS.

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
