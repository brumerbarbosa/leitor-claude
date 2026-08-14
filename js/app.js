(function criarAplicacao(global) {
  "use strict";

  const app = {
    elementos: {},
    modulos: {},
    estado: {
      frases: [],
      fraseParaElemento: [],
      elementosRenderizados: [],
      indiceAtual: 0,
      emPausa: false,
      vozSelecionada: null
    }
  };

  global.LeitorClaude = app;

  function mapearElementos() {
    const ids = [
      "input-texto", "btn-carregar", "btn-direto", "btn-play", "btn-pause",
      "btn-stop", "velocidade", "vel-display", "voz-info", "texto-renderizado",
      "status", "bloco-removido", "lista-removida", "toggle-removido",
      "progresso-bar", "progresso-fill", "painel-comentarios",
      "lista-comentarios", "btn-copiar-comentarios", "btn-limpar-comentarios",
      "copiado-ok", "btn-comentar-flutuante", "popup-comentario", "popup-quote",
      "popup-input", "popup-salvar", "popup-cancelar", "btn-mic", "notas-box",
      "notas-textarea", "notas-chars", "btn-minimizar", "btn-limpar-notas",
      "notas-header"
    ];

    ids.forEach((id) => {
      app.elementos[id] = document.getElementById(id);
    });
  }

  function configurarCarregamento() {
    const el = app.elementos;

    el["btn-carregar"].addEventListener("click", () => {
      const texto = el["input-texto"].value.trim();
      if (!texto) return;

      app.modulos.leitor.parar();
      const resultado = app.modulos.filtro.filtrarLinhas(texto);

      if (resultado.removidas.length) {
        el["lista-removida"].innerHTML = resultado.removidas
          .map((linha) => `<p>${app.modulos.seguranca.escaparHtml(linha)}</p>`)
          .join("");
        el["bloco-removido"].style.display = "block";
        el["toggle-removido"].textContent = `▸ ver ${resultado.removidas.length} linha(s) removida(s)`;
        el["lista-removida"].style.display = "none";
      } else {
        el["bloco-removido"].style.display = "none";
      }

      app.modulos.renderizador.renderizar(resultado.texto);
      app.modulos.leitor.tocarDe(0);
    });

    el["btn-direto"].addEventListener("click", () => {
      const texto = el["input-texto"].value.trim();
      if (!texto) return;

      app.modulos.leitor.parar();
      el["bloco-removido"].style.display = "none";
      app.modulos.renderizador.renderizar(texto);
      app.modulos.leitor.tocarDe(0);
    });

    el["toggle-removido"].addEventListener("click", () => {
      const aberto = el["lista-removida"].style.display !== "none";
      const quantidade = el["lista-removida"].querySelectorAll("p").length;
      el["lista-removida"].style.display = aberto ? "none" : "block";
      el["toggle-removido"].textContent = aberto
        ? `▸ ver ${quantidade} linha(s) removida(s)`
        : "▾ ocultar";
    });
  }

  function configurarAtalhos() {
    document.addEventListener("keydown", (evento) => {
      const camposIgnorados = [
        app.elementos["input-texto"],
        app.elementos["notas-textarea"],
        app.elementos["popup-input"]
      ];

      if (camposIgnorados.includes(evento.target)) return;

      if (evento.code === "Space") {
        evento.preventDefault();
        app.modulos.leitor.alternarPlayPause();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    mapearElementos();
    app.modulos.leitor.inicializar();
    app.modulos.comentarios.inicializar();
    app.modulos.notas.inicializar();
    configurarCarregamento();
    configurarAtalhos();
  });
})(window);
