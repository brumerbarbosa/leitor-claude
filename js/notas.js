(function registrarNotas(app, global) {
  "use strict";

  const CHAVE_NOTAS = "leitor_notas";

  function lerLocal(chave, padrao = "") {
    try {
      return localStorage.getItem(chave) ?? padrao;
    } catch (_) {
      return padrao;
    }
  }

  function salvarLocal(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (_) {
      app.elementos.status.textContent = "Não foi possível salvar localmente neste navegador.";
    }
  }

  function atualizarContagem() {
    const quantidade = app.elementos["notas-textarea"].value.length;
    app.elementos["notas-chars"].textContent = `${quantidade} ${quantidade === 1 ? "caractere" : "caracteres"}`;
  }

  function rolarSecaoNoPainel(secao) {
    const container = app.elementos["painel-lateral-conteudo"];
    if (!container || !secao || container.scrollHeight <= container.clientHeight) return;
    const caixaContainer = container.getBoundingClientRect();
    const caixaSecao = secao.getBoundingClientRect();
    container.scrollTo({
      top: Math.max(0, container.scrollTop + caixaSecao.top - caixaContainer.top - 8),
      behavior: global.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }

  function abrirSecao(nome, focar = false) {
    const el = app.elementos;
    const comentarios = nome === "comentarios";
    const secao = comentarios ? el["painel-comentarios"] : el["painel-notas"];
    el["painel-lateral"].dataset.secaoAtiva = comentarios ? "comentarios" : "notas";

    if (global.matchMedia?.("(max-width: 940px)").matches) app.modulos.shell?.definirPainelMovelAberto(true);

    global.requestAnimationFrame(() => {
      rolarSecaoNoPainel(secao);
      if (!focar) return;
      (comentarios ? secao : el["notas-textarea"]).focus({ preventScroll: true });
    });
  }

  function inicializar() {
    const el = app.elementos;
    el["notas-textarea"].value = lerLocal(CHAVE_NOTAS);
    atualizarContagem();

    el["notas-textarea"].addEventListener("input", () => {
      salvarLocal(CHAVE_NOTAS, el["notas-textarea"].value);
      atualizarContagem();
    });

    el["btn-limpar-notas"].addEventListener("click", () => {
      if (!el["notas-textarea"].value || !global.confirm("Limpar todas as notas?")) return;
      el["notas-textarea"].value = "";
      try { localStorage.removeItem(CHAVE_NOTAS); } catch (_) { /* armazenamento indisponível */ }
      atualizarContagem();
    });
  }

  app.modulos.notas = {
    inicializar,
    abrirSecao,
    abrirAba: abrirSecao
  };
})(window.LeitorClaude, window);
