(function registrarNotas(app, global) {
  "use strict";

  const CHAVE_NOTAS = "leitor_notas";
  let minimizado = false;

  function atualizarContagem() {
    const quantidade = app.elementos["notas-textarea"].value.length;
    app.elementos["notas-chars"].textContent = `${quantidade} caracteres`;
  }

  function alternarMinimizacao() {
    minimizado = !minimizado;
    app.elementos["notas-box"].classList.toggle("minimizado", minimizado);
    app.elementos["btn-minimizar"].textContent = minimizado ? "□" : "─";
    app.elementos["btn-minimizar"].title = minimizado ? "Expandir" : "Minimizar";
    app.elementos["btn-minimizar"].setAttribute("aria-label", minimizado ? "Expandir notas" : "Minimizar notas");
  }

  function inicializar() {
    const el = app.elementos;
    const notasSalvas = localStorage.getItem(CHAVE_NOTAS);
    if (notasSalvas) el["notas-textarea"].value = notasSalvas;
    atualizarContagem();

    el["notas-textarea"].addEventListener("input", () => {
      localStorage.setItem(CHAVE_NOTAS, el["notas-textarea"].value);
      atualizarContagem();
    });

    el["notas-header"].addEventListener("click", alternarMinimizacao);
    el["btn-minimizar"].addEventListener("click", (evento) => {
      evento.stopPropagation();
      alternarMinimizacao();
    });

    el["btn-limpar-notas"].addEventListener("click", (evento) => {
      evento.stopPropagation();
      if (!el["notas-textarea"].value || !global.confirm("Limpar todas as notas?")) return;
      el["notas-textarea"].value = "";
      localStorage.removeItem(CHAVE_NOTAS);
      atualizarContagem();
    });
  }

  app.modulos.notas = {
    inicializar
  };
})(window.LeitorClaude, window);
