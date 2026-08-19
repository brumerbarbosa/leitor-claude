"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { carregarApp } = require("./ambiente.js");

const { renderizador } = carregarApp().modulos;
const { processarInline, removerMarkdownInline, segmentarParaVoz } = renderizador;

test("código com underline não vira itálico", () => {
  assert.equal(
    processarInline("veja `obter_dados_usuario` aqui"),
    "veja <code>obter_dados_usuario</code> aqui"
  );
});

test("código com asterisco não vira ênfase", () => {
  assert.equal(processarInline("use `a*b*c` agora"), "use <code>a*b*c</code> agora");
});

test("negrito e itálico continuam funcionando fora do código", () => {
  assert.equal(
    processarInline("**forte** e _leve_ com `cod_igo`"),
    "<strong>forte</strong> e <em>leve</em> com <code>cod_igo</code>"
  );
});

test("dois links na mesma linha preservam target e rel", () => {
  const html = processarInline("[um](https://a.com/x) e [dois](https://b.com/y)");
  assert.equal(html.match(/target="_blank"/g).length, 2);
  assert.equal(html.match(/rel="noopener noreferrer"/g).length, 2);
  assert.ok(!html.includes("<em>blank"), "o itálico não pode tocar em _blank");
});

test("URL com parênteses é preservada por inteiro", () => {
  const html = processarInline("[verbete](https://pt.wikipedia.org/wiki/Java_(linguagem))");
  assert.ok(html.includes('href="https://pt.wikipedia.org/wiki/Java_(linguagem)"'), html);
});

test("esquemas perigosos não viram link", () => {
  const html = processarInline("[clique](javascript:alert(1))");
  assert.ok(!html.includes("<a "), "javascript: não pode virar link");
  assert.ok(html.includes("[clique]"), "deve permanecer como texto");
});

test("mailto e âncora interna são aceitos", () => {
  assert.ok(processarInline("[email](mailto:a@b.com)").includes('href="mailto:a@b.com"'));
  assert.ok(processarInline("[secao](#topo)").includes('href="#topo"'));
});

test("html do texto colado é escapado", () => {
  assert.equal(
    processarInline("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;"
  );
});

test("a fala usa apenas o rótulo do link", () => {
  assert.equal(
    removerMarkdownInline("veja a [documentação oficial](https://exemplo.com/guia_de_uso) hoje"),
    "veja a documentação oficial hoje"
  );
});

test("a fala separa nomes em snake_case e camelCase", () => {
  assert.equal(removerMarkdownInline("`obter_dados_usuario`"), "{obter dados usuario}");
  assert.equal(removerMarkdownInline("`processarTokenCodigo`"), "{processar Token Codigo}");
});

test("segmentação divide por frases", () => {
  const segmentos = segmentarParaVoz("Primeira frase. Segunda frase! Terceira?");
  assert.equal(segmentos.length, 3);
});

test("segmentos longos são quebrados dentro do limite", () => {
  const longo = Array.from({ length: 60 }, (_, i) => `parte numero ${i}`).join(", ") + ".";
  const segmentos = segmentarParaVoz(longo);
  assert.ok(segmentos.length > 1, "um texto muito longo precisa ser dividido");
  segmentos.forEach((segmento) => {
    assert.ok(segmento.length <= 240, `segmento com ${segmento.length} caracteres`);
  });
});
