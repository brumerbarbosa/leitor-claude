(function criarAplicacao(global) {
  "use strict";

  const CHAVE_SIDEBAR = "leitor_sidebar_recolhida";
  const CHAVE_TEMA = "leitor_tema_claro";
  /* Guardado numa constante: um MediaQueryList sem referência pode ser coletado. */
  const CONSULTA_CELULAR = global.matchMedia?.("(max-width: 640px)");

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
      "leitura-topbar", "painel-comentarios-count",
      "nav-nova-leitura", "nav-leitura", "nav-notas", "nav-comentarios", "nav-ajustes-mobile",
      "nav-preferencias", "menu-ajustes-mobile", "ajuste-velocidade-mobile", "ajuste-velocidade-valor", "ajuste-tema-mobile", "ajuste-tema-titulo", "ajuste-tema-descricao", "area-trabalho", "entrada-card", "entrada-editor",
      "entrada-resumo", "entrada-resumo-titulo", "entrada-resumo-meta", "btn-editar-texto", "btn-cancelar-edicao",
      "input-texto", "btn-carregar", "btn-direto", "btn-limpar-texto", "btn-voz-editor", "voz-info",
      "leitura-workspace", "leitura-titulo", "leitor-viewport", "texto-renderizado", "status",
      "bloco-removido", "lista-removida", "toggle-removido",
      "btn-acompanhar", "acompanhar-label", "barra-selecao-trechos", "selecao-trechos-status", "btn-cancelar-selecao-trechos", "btn-comentar-trecho-marcado", "painel-lateral",
      "painel-lateral-conteudo", "btn-fechar-painel", "painel-backdrop", "painel-notas",
      "painel-comentarios", "comentarios-count", "lista-comentarios",
      "btn-selecionar-trechos", "btn-ouvir-revisao", "btn-copiar-comentarios", "btn-limpar-comentarios", "copiado-ok",
      "btn-comentar-flutuante", "popup-comentario", "popup-quote",
      "dialogo-confirmacao", "dialogo-titulo", "dialogo-descricao", "dialogo-confirmar", "dialogo-cancelar",
      "area-solta-arquivo", "ajuste-exportar-md", "ajuste-exportar-json", "ajuste-importar", "arquivo-importar",
      "ajuste-filtro", "dialogo-filtro", "filtro-categorias", "filtro-termo-novo", "filtro-termo-adicionar",
      "filtro-lista-termos", "filtro-previa", "filtro-restaurar", "filtro-cancelar", "filtro-salvar",
      "popup-input", "popup-salvar", "popup-cancelar", "btn-mic", "notas-box",
      "notas-textarea", "notas-chars", "btn-limpar-notas", "player-fixo",
      "timeline", "tempo-atual", "tempo-total", "player-trecho", "btn-play",
      "btn-stop", "btn-retroceder", "btn-avancar", "vel-display",
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

  /*
   * Substitui o confirm() do navegador, que ignora o tema do app. Usa o <dialog>
   * nativo, que já traz foco preso, Esc para cancelar e fundo modal.
   */
  function confirmar({ titulo, descricao, acaoRotulo = "Confirmar" }) {
    const el = app.elementos;
    const dialogo = el["dialogo-confirmacao"];
    const gatilho = document.activeElement;

    if (!dialogo?.showModal) {
      return Promise.resolve(global.confirm(`${titulo}\n\n${descricao}`));
    }

    el["dialogo-titulo"].textContent = titulo;
    el["dialogo-descricao"].textContent = descricao;
    el["dialogo-confirmar"].textContent = acaoRotulo;

    return new Promise((resolver) => {
      const encerrar = (resultado) => {
        el["dialogo-confirmar"].removeEventListener("click", aoConfirmar);
        el["dialogo-cancelar"].removeEventListener("click", aoCancelar);
        dialogo.removeEventListener("close", aoFechar);
        dialogo.close();
        if (gatilho instanceof HTMLElement) gatilho.focus({ preventScroll: true });
        resolver(resultado);
      };
      const aoConfirmar = () => encerrar(true);
      const aoCancelar = () => encerrar(false);
      const aoFechar = () => encerrar(false);

      el["dialogo-confirmar"].addEventListener("click", aoConfirmar);
      el["dialogo-cancelar"].addEventListener("click", aoCancelar);
      dialogo.addEventListener("close", aoFechar);

      dialogo.showModal();
      el["dialogo-cancelar"].focus({ preventScroll: true });
    });
  }

  function definirPainelMovelAberto(aberto) {
    const el = app.elementos;
    const modoMovel = global.matchMedia?.("(max-width: 940px)").matches;
    const mostrar = Boolean(aberto) && Boolean(modoMovel);
    el["painel-lateral"].classList.toggle("aberto-mobile", mostrar);
    el["painel-backdrop"].hidden = !mostrar;
    document.body.classList.toggle("painel-movel-aberto", mostrar);
  }

  app.modulos.shell = { definirPainelMovelAberto, confirmar };

  function definirTemaClaro(valor, persistir = true) {
    const claro = Boolean(valor);
    const el = app.elementos;
    document.body.classList.toggle("tema-claro", claro);
    el["ajuste-tema-titulo"].textContent = claro ? "Tema claro" : "Tema escuro";
    el["ajuste-tema-descricao"].textContent = claro ? "Mudar para tema escuro" : "Mudar para tema claro";
    el["ajuste-tema-mobile"].querySelector(".icone")?.setAttribute("data-icon", claro ? "sun" : "moon");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", claro ? "#f5f7fc" : "#0c1020");
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

  app.modulos.shell.definirMenuAjustesAberto = definirMenuAjustesAberto;

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

  function prepararNovaLeitura(texto, opcoes = {}) {
    const { tocar = true } = opcoes;
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
    if (app.estado.frases.length && tocar) app.modulos.leitor.tocarDe(0);
  }

  app.modulos.entrada = { prepararNovaLeitura };

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

  /*
   * Arrastar e soltar cobre a janela inteira: durante a leitura o campo de texto
   * fica recolhido, e um alvo pequeno seria difícil de acertar.
   */
  function configurarArrastarArquivo() {
    const el = app.elementos;
    const EXTENSOES = /\.(md|markdown|txt|text)$/i;
    let profundidade = 0;

    const mostrarAviso = (mostrar) => {
      el["area-solta-arquivo"].hidden = !mostrar;
    };

    const temArquivo = (evento) =>
      Array.from(evento.dataTransfer?.types || []).includes("Files");

    document.addEventListener("dragenter", (evento) => {
      if (!temArquivo(evento)) return;
      evento.preventDefault();
      profundidade++;
      mostrarAviso(true);
    });

    document.addEventListener("dragover", (evento) => {
      if (!temArquivo(evento)) return;
      evento.preventDefault();
      evento.dataTransfer.dropEffect = "copy";
    });

    document.addEventListener("dragleave", (evento) => {
      if (!temArquivo(evento)) return;
      profundidade = Math.max(0, profundidade - 1);
      if (!profundidade) mostrarAviso(false);
    });

    document.addEventListener("drop", async (evento) => {
      if (!temArquivo(evento)) return;
      evento.preventDefault();
      profundidade = 0;
      mostrarAviso(false);

      const arquivo = evento.dataTransfer.files[0];
      if (!arquivo) return;

      if (!EXTENSOES.test(arquivo.name) && !arquivo.type.startsWith("text/")) {
        el.status.textContent = `“${arquivo.name}” não é um arquivo de texto.`;
        el["voz-info"].textContent = `Arquivo ignorado: ${arquivo.name} não é texto.`;
        return;
      }

      try {
        const conteudo = (await arquivo.text()).trim();
        if (!conteudo) {
          el.status.textContent = `“${arquivo.name}” está vazio.`;
          return;
        }

        el["input-texto"].value = conteudo;
        el["input-texto"].dispatchEvent(new Event("input", { bubbles: true }));
        prepararNovaLeitura(conteudo);
        el.status.textContent = `${arquivo.name} carregado.`;
      } catch (_) {
        el.status.textContent = `Não foi possível ler “${arquivo.name}”.`;
      }
    });
  }

  /*
   * PWA. O service worker exige http(s), então abrir o index.html direto do disco
   * continua funcionando normalmente, apenas sem instalação e sem modo offline.
   */
  function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (global.location.protocol !== "http:" && global.location.protocol !== "https:") return;

    global.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* Sem service worker o app segue funcionando, só não fica offline. */
      });
    });
  }

  /*
   * Texto vindo do compartilhamento do sistema (share_target do manifest).
   * O endereço é limpo em seguida para o texto não reaparecer ao recarregar.
   */
  function carregarTextoCompartilhado() {
    const parametros = new URLSearchParams(global.location.search);
    const partes = [parametros.get("title"), parametros.get("text"), parametros.get("url")]
      .map((parte) => (parte || "").trim())
      .filter(Boolean);

    if (!partes.length) return;

    const texto = partes.join("\n\n");
    app.elementos["input-texto"].value = texto;
    app.elementos["input-texto"].dispatchEvent(new Event("input", { bubbles: true }));
    prepararNovaLeitura(texto);

    if (global.history?.replaceState) {
      global.history.replaceState({}, "", global.location.pathname);
    }
  }

  /*
   * No celular o trecho sai da faixa de controles e vai para cima da timeline:
   * lá embaixo não há largura para ele sem espremer os botões. A partir do tablet
   * ele volta ao lugar de origem, à esquerda dos controles, onde o layout já cabia.
   */
  function posicionarTrechoDoPlayer() {
    const trecho = app.elementos["player-trecho"];
    const player = app.elementos["player-fixo"];
    const controles = player?.querySelector(".player-linha-controles");
    if (!trecho || !player || !controles) return;

    const estreito = Boolean(CONSULTA_CELULAR?.matches);
    const destino = estreito ? player : controles;
    if (trecho.parentElement !== destino) destino.prepend(trecho);
  }

  function configurarShell() {
    const el = app.elementos;
    const estadoSalvo = app.modulos.seguranca.lerJsonLocal(CHAVE_SIDEBAR, false);
    /* O tema escuro é o padrão da marca; o claro só entra por escolha em Configurações. */
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

      /* Combinações com modificador pertencem ao navegador. */
      if (editavel || evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (!app.estado.frases.length) return;

      const leitor = app.modulos.leitor;
      const tocando = app.estado.reproduzindo && !app.estado.emPausa;
      const acoes = {
        Space: () => leitor.alternarPlayPause(),
        ArrowRight: () => leitor.pular(1),
        ArrowLeft: () => leitor.pular(-1),
        Home: () => leitor.posicionar(0, tocando),
        Mais: () => leitor.ajustarVelocidade(1),
        Menos: () => leitor.ajustarVelocidade(-1)
      };

      let acao = null;
      if (evento.code === "Space") acao = acoes.Space;
      else if (evento.key === "+" || evento.key === "=") acao = acoes.Mais;
      else if (evento.key === "-" || evento.key === "_") acao = acoes.Menos;
      else acao = acoes[evento.key];

      if (!acao) return;
      evento.preventDefault();
      acao();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    mapearElementos();
    app.modulos.ajustes.inicializar();
    app.modulos.renderizador.inicializar();
    app.modulos.leitor.inicializar();
    app.modulos.comentarios.inicializar();
    app.modulos.notas.inicializar();
    app.modulos.dados.inicializar();
    configurarCarregamento();
    configurarArrastarArquivo();
    posicionarTrechoDoPlayer();
    CONSULTA_CELULAR?.addEventListener?.("change", posicionarTrechoDoPlayer);
    /* O resize cobre navegadores e situações em que o evento da consulta não chega. */
    global.addEventListener("resize", posicionarTrechoDoPlayer);
    configurarShell();
    configurarAtalhos();
    registrarServiceWorker();
    carregarTextoCompartilhado();
  });
})(window);
