# Imagens de item corrompidas na vault (#283)

## Sintoma

18 arquivos `.webp` de item em `vault-data/assets/Recursos e Mídia/Imagens/Equipamentos/Tesouros/`
(ex.: `cloak-brown.webp`, `glove-tooled-leather-blue.webp`, `choker-simple-carved-stone.webp`,
`hand-weapon-wood-bark-brown.webp`) não renderizam no app e não geram thumbnail no deploy.

## Causa (dado, não código)

Dois danos empilhados nesses arquivos, na fonte (vault):

1. **Frontmatter colado no binário** — os bytes começam com um bloco
   `---\ndg-publish: true\n---\n` antes do header WebP. Imagem real nunca começa
   com `---`, então isso sozinho já quebra o header.
2. **Re-encode UTF-8** — em algum ponto o arquivo foi lido/gravado como TEXTO
   UTF-8. Todo byte `≥ 0x80` virou o caractere de substituição `�` (`ef bf bd`).
   Os **pixels foram destruídos de forma irreversível** (os bytes originais se
   perderam).

## O que o app/build faz (mascaramento — #283)

`scripts/gen-thumbs.mjs` (`stripLeadingFrontmatter`) remove o frontmatter do
arquivo **copiado no `dist`** (nunca em `vault-data`, que é READ-ONLY) antes de
thumbnailar. Isso:

- **corrige** qualquer imagem que teve SÓ frontmatter prependado (o `file` volta a
  reconhecer, o sharp gera o thumb);
- **não recupera** os 18 atuais, porque o dano nº 2 (UTF-8) apagou os pixels — o
  `file` reconhece o container WebP após o strip, mas o sharp ainda não decodifica.

O gerador loga o erro e **não derruba o deploy**; no app essas 18 caem no fallback
do slot (sem imagem), como antes.

## Correção definitiva (fora do escopo read-only)

Re-salvar os 18 arquivos originais na vault como `.webp` puro (a partir da imagem
de origem, sem passar por editor de texto / sem frontmatter). Aí o mascaramento
nem é mais necessário pra eles, e o thumbnail passa a ser gerado normalmente.

Enquanto isso, `#283` fica aberta rastreando o fix na fonte.
