"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { carregarApp } = require("./ambiente.js");

const { filtro } = carregarApp().modulos;

test("remove frases de planejamento do agente", () => {
  const { texto, removidas } = filtro.filtrarLinhas(
    "Vou analisar o módulo agora.\nO login expira sem aviso."
  );
  assert.equal(texto, "O login expira sem aviso.");
  assert.deepEqual([...removidas], ["Vou analisar o módulo agora."]);
});

test("remove nomes de arquivo soltos e contadores de diff", () => {
  const { texto, removidas } = filtro.filtrarLinhas("auth.js\n+42 -17\nTexto que fica.");
  assert.equal(texto, "Texto que fica.");
  assert.equal(removidas.length, 2);
});

test("mantém texto comum intacto", () => {
  const entrada = "Primeiro parágrafo.\n\nSegundo parágrafo.";
  assert.equal(filtro.filtrarLinhas(entrada).texto, entrada);
});

test("preserva o conteúdo dentro de blocos de código", () => {
  const entrada = [
    "Antes do bloco.",
    "```javascript",
    "function exemplo() {",
    "  // Atualizado",
    "  return 1;",
    "}",
    "```",
    "Depois do bloco."
  ].join("\n");

  const { texto, removidas } = filtro.filtrarLinhas(entrada);
  assert.equal(texto, entrada, "o bloco de código não pode ser alterado");
  assert.deepEqual([...removidas], [], "nada de dentro do código vai para os removidos");
});

test("não aplica as regras de ruído a linhas de código", () => {
  const entrada = "```\nExecutando testes\nAtualizado\n```";
  assert.equal(filtro.filtrarLinhas(entrada).texto, entrada);
});

test("junta linhas em branco fora do código, mas não dentro", () => {
  const fora = filtro.filtrarLinhas("Um.\n\n\n\nDois.");
  assert.equal(fora.texto, "Um.\n\nDois.");

  const dentro = "```\nlinha um\n\n\n\nlinha dois\n```";
  assert.equal(filtro.filtrarLinhas(dentro).texto, dentro);
});

test("mantém o recuo das linhas de código", () => {
  const entrada = "```\n    quatro espacos\n\tuma tabulacao\n```";
  assert.equal(filtro.filtrarLinhas(entrada).texto, entrada);
});
test("categoria desligada deixa a linha passar", () => {
  const entrada = "auth.js\nTexto normal.";
  const semArquivos = filtro.filtrarLinhas(entrada, { arquivos: false });
  assert.equal(semArquivos.texto, entrada);
  assert.equal(semArquivos.removidas.length, 0);
});

test("as demais categorias seguem ativas quando uma é desligada", () => {
  const { removidas } = filtro.filtrarLinhas("auth.js\nVou analisar isso.", { arquivos: false });
  assert.deepEqual([...removidas], ["Vou analisar isso."]);
});

test("termo personalizado remove a linha que o contém", () => {
  const { texto, removidas } = filtro.filtrarLinhas(
    "TODO: revisar depois\nTexto normal.",
    { termos: ["todo:"] }
  );
  assert.equal(texto, "Texto normal.");
  assert.deepEqual([...removidas], ["TODO: revisar depois"]);
});

test("termo personalizado não alcança o interior de blocos de código", () => {
  const entrada = "```\nTODO: dentro do código\n```";
  assert.equal(filtro.filtrarLinhas(entrada, { termos: ["TODO:"] }).texto, entrada);
});

test("configuração inválida cai no padrão em vez de quebrar", () => {
  const entrada = "Vou analisar isso.\nTexto normal.";
  assert.equal(filtro.filtrarLinhas(entrada, null).texto, "Texto normal.");
  assert.equal(filtro.filtrarLinhas(entrada, { termos: "nao é lista" }).texto, "Texto normal.");
});

test("todas as categorias trazem rótulo e exemplo para a tela", () => {
  assert.ok(filtro.CATEGORIAS.length >= 5);
  filtro.CATEGORIAS.forEach((categoria) => {
    assert.equal(typeof categoria.id, "string");
    assert.ok(categoria.rotulo.length > 0, "categoria sem rótulo");
    assert.ok(categoria.exemplo.length > 0, `categoria ${categoria.id} sem exemplo`);
  });
});
