(function criarAplicacao(global) {
  "use strict";

  const CHAVE_SIDEBAR = "leitor_sidebar_recolhida";
  const CHAVE_TEMA = "leitor_tema_claro";

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
      vozSelecionada: null,
      textoCarregado: ""
    }
  };

  global.LeitorClaude = app;

  function mapearElementos() {
    const ids = [
      "app-frame", "app-sidebar", "app-sidebar-conteudo", "btn-sidebar-toggle", "btn-sidebar-logo",
      "leitura-topbar", "voz-select-topbar", "painel-comentarios-count",
      "nav-nova-leitura", "nav-leitura", "nav-notas", "nav-comentarios", "nav-ajustes-mobile",
      "nav-preferencias", "menu-ajustes-mobile", "ajuste-velocidade-mobile", "ajuste-velocidade-valor", "ajuste-tema-mobile", "ajuste-tema-titulo", "ajuste-tema-descricao", "area-trabalho", "entrada-card", "entrada-editor",
      "entrada-resumo", "entrada-resumo-titulo", "entrada-resumo-meta", "btn-editar-texto", "btn-cancelar-edicao",
      "input-texto", "btn-carregar", "btn-direto", "btn-limpar-texto", "btn-voz-editor", "voz-info",
      "leitura-workspace", "leitura-titulo", "leitor-viewport", "texto-renderizado", "status",
      "bloco-removido", "lista-removida", "toggle-removido",
      "btn-acompanhar", "acompanhar-label", "barra-selecao-trechos", "selecao-trechos-status", "btn-cancelar-selecao-trechos", "btn-comentar-trecho-marcado", "painel-lateral",
      "painel-lateral-conteudo", "btn-fechar-painel", "painel-backdrop", "painel-notas",
      "painel-comentarios", "comentarios-count", "lista-comentarios",
      "btn-selecionar-trechos", "btn-copiar-comentarios", "btn-limpar-comentarios", "copiado-ok",
      "btn-comentar-flutuante", "popup-comentario", "popup-quote",
      "popup-input", "popup-salvar", "popup-cancelar", "btn-mic", "notas-box",
      "notas-textarea", "notas-chars", "btn-limpar-notas", "player-fixo",
      "timeline", "tempo-atual", "tempo-total", "player-trecho", "btn-play",
      "btn-stop", "btn-retroceder", "btn-avancar", "velocidade", "vel-display",
      "btn-volume", "volume-popup", "volume-slider", "volume-valor",
      "btn-voz-menu", "voz-selecionada-label", "voz-menu", "btn-velocidade-menu", "velocidade-menu"
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
    const iconeToggle = el["btn-sidebar-toggle"].querySelector(".icone");
    app.estado.sidebarRecolhida = recolhida;
    el["app-frame"].classList.toggle("sidebar-recolhida", recolhida);
    iconeToggle?.setAttribute("data-icon", recolhida ? "chevron-right" : "chevron-left");
    el["btn-sidebar-toggle"].setAttribute("aria-expanded", String(!recolhida));
    el["btn-sidebar-toggle"].setAttribute("aria-label", recolhida ? "Expandir menu" : "Recolher menu");
    el["btn-sidebar-logo"].setAttribute("aria-expanded", String(!recolhida));
    if (persistir) salvarPreferencia(CHAVE_SIDEBAR, recolhida);
  }

  function atualizarBotaoRemovidos(aberto, quantidade) {
    const botao = app.elementos["toggle-removido"];
    botao.querySelector(".icone")?.setAttribute("data-icon", aberto ? "chevron-down" : "chevron-right");
    botao.querySelector("span").textContent = aberto
      ? "ocultar linhas removidas"
      : `ver ${quantidade} linha(s) removida(s)`;
    botao.setAttribute("aria-expanded", String(aberto));
  }

  function definirPainelMovelAberto(aberto) {
    const el = app.elementos;
    const modoMovel = global.matchMedia?.("(max-width: 940px)").matches;
    const mostrar = Boolean(aberto) && Boolean(modoMovel);
    el["painel-lateral"].classList.toggle("aberto-mobile", mostrar);
    el["painel-backdrop"].hidden = !mostrar;
    document.body.classList.toggle("painel-movel-aberto", mostrar);
  }

  app.modulos.shell = { definirPainelMovelAberto };

  function definirTemaClaro(valor, persistir = true) {
    const claro = Boolean(valor);
    const el = app.elementos;
    document.body.classList.toggle("tema-claro", claro);
    el["ajuste-tema-titulo"].textContent = claro ? "Tema claro" : "Tema escuro";
    el["ajuste-tema-descricao"].textContent = claro ? "Mudar para tema escuro" : "Mudar para tema claro";
    el["ajuste-tema-mobile"].querySelector(".icone")?.setAttribute("data-icon", claro ? "sun" : "moon");
    if (persistir) salvarPreferencia(CHAVE_TEMA, claro);
  }

  function definirMenuAjustesAberto(aberto) {
    const el = app.elementos;
    const mostrar = Boolean(aberto);
    el["menu-ajustes-mobile"].hidden = !mostrar;
    el["nav-ajustes-mobile"].setAttribute("aria-expanded", String(mostrar));
    el["nav-preferencias"].setAttribute("aria-expanded", String(mostrar));
    el["nav-ajustes-mobile"].classList.toggle("ativo", mostrar);
    el["nav-preferencias"].classList.toggle("ativo", mostrar);
    if (mostrar) {
      global.requestAnimationFrame(() => {
        (el["ajuste-velocidade-mobile"].disabled ? el["ajuste-tema-mobile"] : el["ajuste-velocidade-mobile"])
          .focus({ preventScroll: true });
      });
    }
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
    const editandoLeitura = !recolher && app.estado.frases.length > 0;
    app.estado.entradaRecolhida = recolher;
    el["entrada-card"].hidden = recolher;
    el["entrada-editor"].hidden = false;
    el["entrada-resumo"].hidden = !recolher;
    el["leitura-topbar"].hidden = !recolher;
    el["btn-editar-texto"].setAttribute("aria-expanded", String(!recolher));
    el["btn-cancelar-edicao"].hidden = !editandoLeitura;
    el["area-trabalho"].classList.toggle("editando-entrada", editandoLeitura);
    document.body.classList.toggle("editando-texto", editandoLeitura);

    if (app.estado.frases.length > 0) {
      el["player-fixo"].hidden = false;
      document.body.classList.add("com-player");
    }

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
    ["nav-leitura", "nav-notas", "nav-comentarios"].forEach((id) => {
      el[id].disabled = !disponivel;
    });
    el["ajuste-velocidade-mobile"].disabled = !disponivel;

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

  function prepararNovaLeitura(texto) {
    const el = app.elementos;
    app.modulos.leitor.parar();

    const resultado = app.modulos.filtro.filtrarLinhas(texto);

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
    app.estado.textoCarregado = texto;
    atualizarModoLeitura();
    if (app.estado.frases.length) app.modulos.leitor.tocarDe(0);
  }

  function configurarCarregamento() {
    const el = app.elementos;

    el["btn-carregar"].addEventListener("click", async () => {
      el["btn-carregar"].disabled = true;
      try {
        if (!navigator.clipboard?.readText) throw new Error("clipboard-indisponivel");
        const texto = await navigator.clipboard.readText();
        if (!texto) {
          el["input-texto"].focus({ preventScroll: true });
          return;
        }

        el["input-texto"].value = texto;
        el["input-texto"].dispatchEvent(new Event("input", { bubbles: true }));
        prepararNovaLeitura(texto.trim());
      } catch (_) {
        el["input-texto"].focus({ preventScroll: true });
      } finally {
        el["btn-carregar"].disabled = false;
      }
    });

    el["btn-direto"].addEventListener("click", () => {
      const texto = el["input-texto"].value.trim();
      if (!texto) {
        el["input-texto"].focus();
        return;
      }
      prepararNovaLeitura(texto);
    });

    const atualizarBotaoLimparTexto = () => {
      el["btn-limpar-texto"].disabled = el["input-texto"].value.length === 0;
    };

    el["input-texto"].addEventListener("input", atualizarBotaoLimparTexto);
    el["btn-limpar-texto"].addEventListener("click", () => {
      el["input-texto"].value = "";
      el["input-texto"].dispatchEvent(new Event("input", { bubbles: true }));
      el["input-texto"].focus({ preventScroll: true });
    });
    atualizarBotaoLimparTexto();

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

    el["btn-cancelar-edicao"].addEventListener("click", () => {
      el["input-texto"].value = app.estado.textoCarregado;
      el["input-texto"].dispatchEvent(new Event("input", { bubbles: true }));
      definirEntradaRecolhida(true, true);
      definirNavegacaoAtiva("nav-leitura");
    });
  }

  function configurarShell() {
    const el = app.elementos;
    const estadoSalvo = app.modulos.seguranca.lerJsonLocal(CHAVE_SIDEBAR, false);
    const temaClaroSalvo = app.modulos.seguranca.lerJsonLocal(CHAVE_TEMA, false);
    definirSidebarRecolhida(Boolean(estadoSalvo), false);
    definirTemaClaro(Boolean(temaClaroSalvo), false);

    el["btn-sidebar-toggle"].addEventListener("click", () => {
      definirSidebarRecolhida(!app.estado.sidebarRecolhida);
    });

    el["btn-sidebar-logo"].addEventListener("click", () => {
      if (global.matchMedia?.("(min-width: 641px) and (max-width: 940px)").matches) {
        definirSidebarRecolhida(!app.estado.sidebarRecolhida);
      }
    });

    el["nav-nova-leitura"].addEventListener("click", () => {
      definirPainelMovelAberto(false);
      definirMenuAjustesAberto(false);
      app.modulos.leitor.parar();

      el["input-texto"].value = "";
      el["input-texto"].dispatchEvent(new Event("input", { bubbles: true }));
      app.estado.textoCarregado = "";

      el["lista-removida"].replaceChildren();
      el["lista-removida"].style.display = "none";
      el["bloco-removido"].style.display = "none";

      app.modulos.renderizador.renderizar("");
      atualizarModoLeitura();
      definirEntradaRecolhida(false, true);
    });

    el["nav-leitura"].addEventListener("click", () => {
      definirPainelMovelAberto(false);
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
      definirPainelMovelAberto(false);
      definirMenuAjustesAberto(el["menu-ajustes-mobile"].hidden);
    });

    el["nav-ajustes-mobile"].addEventListener("click", (evento) => {
      evento.stopPropagation();
      definirPainelMovelAberto(false);
      definirMenuAjustesAberto(el["menu-ajustes-mobile"].hidden);
    });

    el["ajuste-velocidade-mobile"].addEventListener("click", () => {
      definirMenuAjustesAberto(false);
      app.modulos.leitor.abrirMenuVelocidade();
    });

    el["ajuste-tema-mobile"].addEventListener("click", () => {
      definirTemaClaro(!document.body.classList.contains("tema-claro"));
    });

    document.addEventListener("pointerdown", (evento) => {
      if (el["menu-ajustes-mobile"].hidden) return;
      if (el["menu-ajustes-mobile"].contains(evento.target) || el["nav-ajustes-mobile"].contains(evento.target) || el["nav-preferencias"].contains(evento.target)) return;
      definirMenuAjustesAberto(false);
    });

    el["btn-fechar-painel"].addEventListener("click", () => {
      definirPainelMovelAberto(false);
      el["nav-leitura"].focus();
      definirNavegacaoAtiva("nav-leitura");
    });

    el["painel-backdrop"].addEventListener("click", () => {
      definirPainelMovelAberto(false);
      el["nav-leitura"].focus();
      definirNavegacaoAtiva("nav-leitura");
    });

    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && !el["menu-ajustes-mobile"].hidden) {
        definirMenuAjustesAberto(false);
        const gatilhoVisivel = el["nav-ajustes-mobile"].getClientRects().length
          ? el["nav-ajustes-mobile"]
          : el["nav-preferencias"];
        gatilhoVisivel.focus();
        return;
      }
      const painelMovelAberto = global.matchMedia?.("(max-width: 940px)").matches
        && el["painel-lateral"].classList.contains("aberto-mobile");
      if (evento.key !== "Escape" || !painelMovelAberto) return;
      definirPainelMovelAberto(false);
      el["nav-leitura"].focus();
      definirNavegacaoAtiva("nav-leitura");
    });

    global.addEventListener("resize", () => {
      if (!global.matchMedia?.("(max-width: 940px)").matches) definirPainelMovelAberto(false);
    });
  }

  function configurarAtalhos() {
    document.addEventListener("keydown", (evento) => {
      const alvo = evento.target;
      const editavel = alvo instanceof HTMLElement && (
        alvo.matches("button, input, select, textarea, [contenteditable='true'], [role='button']") ||
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
