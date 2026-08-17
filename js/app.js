(function criarAplicacao(global) {
  "use strict";

  const CHAVE_SIDEBAR = "leitor_sidebar_recolhida";

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
      entradaRecolhida: false,
      sidebarRecolhida: false,
      vozSelecionada: null
    }
  };

  global.LeitorClaude = app;

  function mapearElementos() {
    const ids = [
      "app-frame", "app-sidebar", "app-sidebar-conteudo", "btn-sidebar-toggle",
      "nav-nova-leitura", "nav-leitura", "nav-notas", "nav-comentarios",
      "nav-preferencias", "area-trabalho", "entrada-card", "entrada-editor",
      "entrada-resumo", "entrada-resumo-meta", "btn-editar-texto",
      "input-texto", "btn-carregar", "btn-direto", "voz-info",
      "leitura-workspace", "leitor-viewport", "texto-renderizado", "status",
      "bloco-removido", "lista-removida", "toggle-removido",
      "btn-acompanhar", "acompanhar-label", "painel-lateral",
      "painel-lateral-conteudo", "btn-fechar-painel", "painel-notas",
      "painel-comentarios", "comentarios-count", "lista-comentarios",
      "btn-copiar-comentarios", "btn-limpar-comentarios", "copiado-ok",
      "btn-comentar-flutuante", "popup-comentario", "popup-quote",
      "popup-input", "popup-salvar", "popup-cancelar", "btn-mic", "notas-box",
      "notas-textarea", "notas-chars", "btn-limpar-notas", "player-fixo",
      "timeline", "tempo-atual", "tempo-total", "player-trecho", "btn-play",
      "btn-stop", "btn-retroceder", "btn-avancar", "velocidade", "vel-display"
    ];

    ids.forEach((id) => {
      app.elementos[id] = document.getElementById(id);
    });
  }

  function salvarPreferencia(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (_) {
      /* A interface continua funcional sem persistência. */
    }
  }

  function definirSidebarRecolhida(valor, persistir = true) {
    const recolhida = Boolean(valor);
    const el = app.elementos;
    const iconeToggle = el["btn-sidebar-toggle"].querySelector("use");
    app.estado.sidebarRecolhida = recolhida;
    el["app-frame"].classList.toggle("sidebar-recolhida", recolhida);
    iconeToggle?.setAttribute("href", recolhida ? "#icon-chevron-right" : "#icon-chevron-left");
    el["btn-sidebar-toggle"].setAttribute("aria-expanded", String(!recolhida));
    el["btn-sidebar-toggle"].setAttribute("aria-label", recolhida ? "Expandir menu" : "Recolher menu");
    if (persistir) salvarPreferencia(CHAVE_SIDEBAR, recolhida);
  }

  function atualizarBotaoRemovidos(aberto, quantidade) {
    const botao = app.elementos["toggle-removido"];
    botao.querySelector("use")?.setAttribute("href", aberto ? "#icon-chevron-down" : "#icon-chevron-right");
    botao.querySelector("span").textContent = aberto
      ? "ocultar linhas removidas"
      : `ver ${quantidade} linha(s) removida(s)`;
    botao.setAttribute("aria-expanded", String(aberto));
  }

  function definirNavegacaoAtiva(id) {
    ["nav-nova-leitura", "nav-leitura", "nav-notas", "nav-comentarios", "nav-preferencias"].forEach((navId) => {
      const ativa = navId === id;
      app.elementos[navId].classList.toggle("ativo", ativa);
      if (ativa) app.elementos[navId].setAttribute("aria-current", "page");
      else app.elementos[navId].removeAttribute("aria-current");
    });
  }

  function definirEntradaRecolhida(valor, focar = false) {
    const el = app.elementos;
    const recolher = Boolean(valor) && app.estado.frases.length > 0;
    app.estado.entradaRecolhida = recolher;
    el["entrada-card"].classList.toggle("recolhida", recolher);
    el["entrada-editor"].hidden = recolher;
    el["entrada-resumo"].hidden = !recolher;
    el["btn-editar-texto"].setAttribute("aria-expanded", String(!recolher));
    el["area-trabalho"].classList.toggle("editando-entrada", !recolher && app.estado.frases.length > 0);

    if (focar) {
      global.requestAnimationFrame(() => {
        (recolher ? el["leitor-viewport"] : el["input-texto"]).focus({ preventScroll: true });
      });
    }
  }

  function atualizarModoLeitura() {
    const el = app.elementos;
    const disponivel = app.estado.frases.length > 0;
    el["leitura-workspace"].hidden = !disponivel;
    el["painel-lateral"].hidden = !disponivel;
    el["area-trabalho"].classList.toggle("tem-leitura", disponivel);
    ["nav-leitura", "nav-notas", "nav-comentarios", "nav-preferencias"].forEach((id) => {
      el[id].disabled = !disponivel;
    });

    if (disponivel) {
      const quantidade = app.estado.frases.length;
      el["entrada-resumo-meta"].textContent = `${quantidade} ${quantidade === 1 ? "trecho preparado" : "trechos preparados"}`;
      definirEntradaRecolhida(true);
      definirNavegacaoAtiva("nav-leitura");
    } else {
      definirEntradaRecolhida(false);
      definirNavegacaoAtiva("nav-nova-leitura");
    }
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
      atualizarBotaoRemovidos(false, resultado.removidas.length);
      el["lista-removida"].style.display = "none";
    } else {
      el["bloco-removido"].style.display = "none";
    }

    app.modulos.renderizador.renderizar(resultado.texto);
    atualizarModoLeitura();
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
      atualizarBotaoRemovidos(!aberto, quantidade);
    });

    el["btn-editar-texto"].addEventListener("click", () => {
      definirEntradaRecolhida(false, true);
      definirNavegacaoAtiva("nav-nova-leitura");
    });
  }

  function configurarShell() {
    const el = app.elementos;
    const estadoSalvo = app.modulos.seguranca.lerJsonLocal(CHAVE_SIDEBAR, false);
    definirSidebarRecolhida(Boolean(estadoSalvo), false);

    el["btn-sidebar-toggle"].addEventListener("click", () => {
      definirSidebarRecolhida(!app.estado.sidebarRecolhida);
    });

    el["nav-nova-leitura"].addEventListener("click", () => {
      el["painel-lateral"].classList.remove("aberto-mobile");
      definirEntradaRecolhida(false, true);
      definirNavegacaoAtiva("nav-nova-leitura");
    });

    el["nav-leitura"].addEventListener("click", () => {
      el["painel-lateral"].classList.remove("aberto-mobile");
      definirEntradaRecolhida(true, true);
      definirNavegacaoAtiva("nav-leitura");
    });

    el["nav-notas"].addEventListener("click", () => {
      app.modulos.notas.abrirSecao("notas", true);
      definirNavegacaoAtiva("nav-notas");
    });

    el["nav-comentarios"].addEventListener("click", () => {
      app.modulos.notas.abrirSecao("comentarios", true);
      definirNavegacaoAtiva("nav-comentarios");
    });

    el["nav-preferencias"].addEventListener("click", () => {
      el["painel-lateral"].classList.remove("aberto-mobile");
      definirNavegacaoAtiva("nav-preferencias");
      el.velocidade.focus({ preventScroll: true });
      el["player-fixo"].classList.add("realce-preferencias");
      el.status.textContent = "Preferências de velocidade disponíveis no player.";
      global.setTimeout(() => el["player-fixo"].classList.remove("realce-preferencias"), 1200);
    });

    el["btn-fechar-painel"].addEventListener("click", () => {
      el["painel-lateral"].classList.remove("aberto-mobile");
      el["nav-leitura"].focus();
      definirNavegacaoAtiva("nav-leitura");
    });

    document.addEventListener("keydown", (evento) => {
      const painelMovelAberto = global.matchMedia?.("(max-width: 940px)").matches
        && el["painel-lateral"].classList.contains("aberto-mobile");
      if (evento.key !== "Escape" || !painelMovelAberto) return;
      el["painel-lateral"].classList.remove("aberto-mobile");
      el["nav-leitura"].focus();
      definirNavegacaoAtiva("nav-leitura");
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
    configurarShell();
    configurarAtalhos();
  });
})(window);
