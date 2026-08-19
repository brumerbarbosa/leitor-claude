"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { carregarApp } = require("./ambiente.js");

const { leitor, seguranca } = carregarApp().modulos;

test("prepararTexto junta espaços repetidos", () => {
  assert.equal(leitor.prepararTexto("uma    frase   solta"), "uma frase solta");
});

test("prepararTexto remove o espaço antes da pontuação", () => {
  assert.equal(leitor.prepararTexto("olá , tudo bem ?"), "olá, tudo bem?");
});

test("prepararTexto remove espaços das pontas", () => {
  assert.equal(leitor.prepararTexto("   texto   "), "texto");
});

test("escaparHtml neutraliza aspas e sinais", () => {
  assert.equal(
    seguranca.escaparHtml(`<a href="x">'&</a>`),
    "&lt;a href=&quot;x&quot;&gt;&#039;&amp;&lt;/a&gt;"
  );
});

test("lerJsonLocal devolve o padrão quando a chave não existe", () => {
  assert.equal(seguranca.lerJsonLocal("chave_inexistente", "padrao"), "padrao");
  assert.equal(seguranca.lerJsonLocal("chave_inexistente", null), null);
});
