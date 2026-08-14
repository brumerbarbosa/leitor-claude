(function registrarSeguranca(app) {
  "use strict";

  function escaparHtml(valor) {
    return String(valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function lerJsonLocal(chave, valorPadrao) {
    try {
      const valor = localStorage.getItem(chave);
      return valor === null ? valorPadrao : JSON.parse(valor);
    } catch (erro) {
      console.warn(`Não foi possível recuperar ${chave}.`, erro);
      return valorPadrao;
    }
  }

  app.modulos.seguranca = {
    escaparHtml,
    lerJsonLocal
  };
})(window.LeitorClaude);
