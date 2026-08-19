"use strict";

/*
 * Os módulos do app são scripts tradicionais que se registram em window.LeitorClaude.
 * Aqui eles são executados num contexto isolado, com apenas os globais que usam,
 * para que as funções puras possam ser testadas fora do navegador.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RAIZ = path.join(__dirname, "..");

function carregarApp(modulos = ["seguranca", "filtro", "leitor", "renderizador"]) {
  const app = { modulos: {}, elementos: {}, estado: {} };
  const armazenamento = new Map();

  const contexto = {
    console,
    Intl,
    localStorage: {
      getItem: (chave) => (armazenamento.has(chave) ? armazenamento.get(chave) : null),
      setItem: (chave, valor) => armazenamento.set(chave, String(valor)),
      removeItem: (chave) => armazenamento.delete(chave)
    }
  };
  contexto.window = contexto;
  contexto.global = contexto;
  contexto.window.LeitorClaude = app;
  vm.createContext(contexto);

  modulos.forEach((nome) => {
    const arquivo = path.join(RAIZ, "js", `${nome}.js`);
    vm.runInContext(fs.readFileSync(arquivo, "utf8"), contexto, { filename: `${nome}.js` });
  });

  return app;
}

module.exports = { carregarApp };
