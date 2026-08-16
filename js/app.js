(function criarAplicacao(global) {
  "use strict";

  const app = {
    elementos: {},
    modulos: {},
    estado: {
      frases: [],
      fraseParaElemento: [],
      elementosRenderizados: [],
      pesosFrases: [],
      pesoTotal: 0,
      indiceAtual: 0,
      emPausa: false,
      reproduzindo: false,
      finalizado: false,
      seguindoLeitura: true,
      vozSelecionada: null
    }
  };

  global.LeitorClaude = app;

  function mapearElementos() {
    const ids = [
      "input-texto", "btn-carregar", "btn-direto", "voz-info",
      "leitura-workspace", "leitor-viewport", "texto-renderizado", "status",
      "bloco-removido", "lista-removida", "toggle-removido",
      "btn-acompanhar", "acompanhar-label",
      "painel-lateral", "painel-lateral-conteudo", "tab-notas", "tab-comentarios",
      "painel-notas", "painel-comentarios", "comentarios-count",
      "lista-comentarios", "btn-copiar-comentarios", "btn-limpar-comentarios",
      "copiado-ok", "btn-comentar-flutuante", "popup-comentario", "popup-quote",
      "popup-input", "popup-salvar", "popup-cancelar", "btn-mic", "notas-box",
      "notas-textarea", "notas-chars", "btn-minimizar", "btn-limpar-notas",
      "notas-header", "player-fixo", "timeline", "tempo-atual", "tempo-total",
      "player-trecho", "btn-play", "btn-stop", "btn-retroceder", "btn-avancar",
      "velocidade", "vel-display"
    ];

    ids.forEach((id) => {
      app.elementos[id] = document.getElementById(id);
    });
  }

  function prepararNovaLeitura(texto, aplicarFiltro) {
    const el = app.elementos;
    app.modulos.leitor.parar();

    const resultado = aplicarFiltro
      ? app.modulos.filtro.filtrarLinhas(texto)
      : { texto, removidas: [] };

    if (resultado.removidas.length) {
      el["lista-removida"].innerHTML = resultado.removidas
        .map((linha) => `<p>${app.modulos.seguranca.escaparHtml(linha)}</p>`)
        .join("");
      el["bloco-removido"].style.display = "block";
      el["toggle-removido"].textContent = `▸ ver ${resultado.removidas.length} linha(s) removida(s)`;
      el["toggle-removido"].setAttribute("aria-expanded", "false");
      el["lista-removida"].style.display = "none";
    } else {
      el["bloco-removido"].style.display = "none";
    }

    app.modulos.renderizador.renderizar(resultado.texto);
    if (app.estado.frases.length) app.modulos.leitor.tocarDe(0);
  }

  function configurarCarregamento() {
    const el = app.elementos;

    el["btn-carregar"].addEventListener("click", () => {
      const texto = el["input-texto"].value.trim();
      if (!texto) {
        el["input-texto"].focus();
        return;
      }
      prepararNovaLeitura(texto, true);
    });

    el["btn-direto"].addEventListener("click", () => {
      const texto = el["input-texto"].value.trim();
      if (!texto) {
        el["input-texto"].focus();
        return;
      }
      prepararNovaLeitura(texto, false);
    });

    el["toggle-removido"].addEventListener("click", () => {
      const aberto = el["lista-removida"].style.display !== "none";
      const quantidade = el["lista-removida"].querySelectorAll("p").length;
      el["lista-removida"].style.display = aberto ? "none" : "block";
      el["toggle-removido"].setAttribute("aria-expanded", String(!aberto));
      el["toggle-removido"].textContent = aberto
        ? `▸ ver ${quantidade} linha(s) removida(s)`
        : "▾ ocultar linhas removidas";
    });
  }

  function configurarAtalhos() {
    document.addEventListener("keydown", (evento) => {
      const alvo = evento.target;
      const editavel = alvo instanceof HTMLElement && (
        alvo.matches("button, input, select, textarea, [contenteditable='true']") ||
        Boolean(alvo.closest("[contenteditable='true']"))
      );

      if (editavel) return;

      if (evento.code === "Space" && app.estado.frases.length) {
        evento.preventDefault();
        app.modulos.leitor.alternarPlayPause();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    mapearElementos();
    app.modulos.renderizador.inicializar();
    app.modulos.leitor.inicializar();
    app.modulos.comentarios.inicializar();
    app.modulos.notas.inicializar();
    configurarCarregamento();
    configurarAtalhos();
  });
})(window);
