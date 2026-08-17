(function registrarComentarios(app, global) {
  "use strict";

  const CHAVE_COMENTARIOS = "leitor_comentarios";
  let comentarios = [];
  let selecaoAtual = null;
  let reconhecimento = null;
  let microfoneAtivo = false;
  let textoBase = "";
  let hashDocumentoAtual = "";
  let rafPosicionamento = 0;

  function salvarNoNavegador() {
    try {
      localStorage.setItem(CHAVE_COMENTARIOS, JSON.stringify(comentarios));
    } catch (_) {
      app.elementos.status.textContent = "Não foi possível salvar os comentários neste navegador.";
    }
  }

  function hashTexto(texto) {
    let hash = 2166136261;
    for (let indice = 0; indice < texto.length; indice++) {
      hash ^= texto.charCodeAt(indice);
      hash = Math.imul(hash, 16777619);
    }
    return `${texto.length}-${(hash >>> 0).toString(36)}`;
  }

  function comentariosDoDocumentoAtual() {
    if (!hashDocumentoAtual) return [];
    return comentarios.filter((comentario) => comentario.documento === hashDocumentoAtual);
  }

  function migrarComentariosLegados(textoDocumento) {
    let alterou = false;
    comentarios.forEach((comentario) => {
      const podeMigrar = !comentario.documento || (
        comentario.documento === hashDocumentoAtual && !comentario.ancora
      );
      if (!podeMigrar || !comentario.quote) return;

      const quote = comentario.quote.trim();
      const inicio = textoDocumento.indexOf(quote);
      const repetido = inicio >= 0 && textoDocumento.indexOf(quote, inicio + 1) >= 0;
      if (inicio < 0 || repetido) return;

      comentario.documento = hashDocumentoAtual;
      comentario.ancora = { inicio, fim: inicio + quote.length };
      alterou = true;
    });

    if (alterou) salvarNoNavegador();
  }

  function rolarDentro(container, elemento) {
    if (!container || !elemento) return;
    const caixaContainer = container.getBoundingClientRect();
    const caixaElemento = elemento.getBoundingClientRect();
    if (caixaElemento.top >= caixaContainer.top && caixaElemento.bottom <= caixaContainer.bottom) return;

    container.scrollTo({
      top: Math.max(0, container.scrollTop + caixaElemento.top - caixaContainer.top - 18),
      behavior: global.matchMedia?.("(prefers-reduced-motion: reduce), (max-width: 940px)").matches
        ? "auto"
        : "smooth"
    });
  }

  function exibirAreaNoMobile(elemento) {
    if (!global.matchMedia?.("(max-width: 940px)").matches || !elemento) return;
    const painel = app.elementos["painel-lateral"];
    painel.classList.toggle("aberto-mobile", painel.contains(elemento));
  }

  function abrirComentarioNaLateral(id) {
    app.modulos.notas?.abrirSecao("comentarios");
    const item = app.elementos["lista-comentarios"].querySelector(`.comentario-item[data-id="${id}"]`);
    if (!item) return;

    rolarDentro(app.elementos["lista-comentarios"], item);
    exibirAreaNoMobile(item);
    item.classList.add("realce");
    item.querySelector(".ci-abrir")?.focus({ preventScroll: true });
    global.setTimeout(() => item.classList.remove("realce"), 1200);
  }

  function criarMarcacao(id) {
    const marca = document.createElement("mark");
    marca.className = "trecho-comentado";
    marca.dataset.id = String(id);
    marca.title = "Abrir comentário deste trecho";
    marca.tabIndex = 0;
    marca.setAttribute("role", "button");

    const abrir = (evento) => {
      evento.stopPropagation();
      abrirComentarioNaLateral(id);
    };
    marca.addEventListener("click", abrir);
    marca.addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter" && evento.key !== " ") return;
      evento.preventDefault();
      abrir(evento);
    });
    return marca;
  }

  function destacarTrecho(intervalo, id) {
    if (!intervalo || intervalo.collapsed) return;

    if (intervalo.startContainer === intervalo.endContainer) {
      try {
        intervalo.surroundContents(criarMarcacao(id));
        return;
      } catch (_) {
        // Seleções que cruzam elementos são tratadas abaixo.
      }
    }

    const raiz = intervalo.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? intervalo.commonAncestorContainer.parentNode
      : intervalo.commonAncestorContainer;
    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nos = [];

    while (walker.nextNode()) {
      const no = walker.currentNode;
      try {
        if (intervalo.intersectsNode(no)) nos.push(no);
      } catch (_) {
        // Ignora nós que o navegador não consegue comparar.
      }
    }

    nos.forEach((no) => {
      const inicio = no === intervalo.startContainer ? intervalo.startOffset : 0;
      const fim = no === intervalo.endContainer ? intervalo.endOffset : no.length;
      if (inicio >= fim) return;

      try {
        const trecho = document.createRange();
        trecho.setStart(no, inicio);
        trecho.setEnd(no, fim);
        trecho.surroundContents(criarMarcacao(id));
      } catch (_) {
        // Um trecho inválido não impede os demais destaques.
      }
    });
  }

  function obterAncora(intervalo) {
    const raiz = app.elementos["texto-renderizado"];
    const prefixo = document.createRange();
    prefixo.selectNodeContents(raiz);
    prefixo.setEnd(intervalo.startContainer, intervalo.startOffset);
    const inicio = prefixo.toString().length;
    return { inicio, fim: inicio + intervalo.toString().length };
  }

  function criarIntervaloPorOffsets(inicio, fim) {
    const raiz = app.elementos["texto-renderizado"];
    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const intervalo = document.createRange();
    let cursor = 0;
    let inicioDefinido = false;
    let noFinal = null;
    let offsetFinal = 0;

    while (walker.nextNode()) {
      const no = walker.currentNode;
      const proximo = cursor + no.length;

      if (!inicioDefinido && inicio >= cursor && inicio <= proximo) {
        intervalo.setStart(no, Math.min(no.length, inicio - cursor));
        inicioDefinido = true;
      }

      if (inicioDefinido && fim >= cursor && fim <= proximo) {
        noFinal = no;
        offsetFinal = Math.min(no.length, fim - cursor);
        break;
      }
      cursor = proximo;
    }

    if (!inicioDefinido || !noFinal) return null;
    intervalo.setEnd(noFinal, offsetFinal);
    return intervalo.collapsed ? null : intervalo;
  }

  function reaplicarMarcacoes() {
    const raiz = app.elementos["texto-renderizado"];
    raiz.querySelectorAll("mark.trecho-comentado").forEach((marca) => marca.replaceWith(...marca.childNodes));
    raiz.normalize();

    comentarios
      .filter((comentario) => comentario.documento === hashDocumentoAtual && comentario.ancora)
      .forEach((comentario) => {
        const intervalo = criarIntervaloPorOffsets(comentario.ancora.inicio, comentario.ancora.fim);
        if (!intervalo || intervalo.toString().trim() !== comentario.quote.trim()) return;
        destacarTrecho(intervalo, comentario.id);
      });
  }

  function localizarMarcacao(id) {
    return app.elementos["texto-renderizado"].querySelector(`mark[data-id="${id}"]`);
  }

  function irParaTrechoComentado(id) {
    const marca = localizarMarcacao(id);
    if (!marca) {
      app.elementos.status.textContent = "Esse comentário pertence a outro texto ou o trecho foi alterado.";
      return;
    }
    app.modulos.renderizador.definirAcompanhamento(false, false);
    app.modulos.renderizador.rolarElementoNoLeitor(marca, true);
    exibirAreaNoMobile(app.elementos["leitura-workspace"]);
    marca.focus({ preventScroll: true });
  }

  function renderizarComentarios() {
    const el = app.elementos;
    const comentariosVisiveis = comentariosDoDocumentoAtual();
    el["comentarios-count"].textContent = String(comentariosVisiveis.length);
    el["btn-copiar-comentarios"].disabled = comentariosVisiveis.length === 0;
    el["btn-limpar-comentarios"].disabled = comentariosVisiveis.length === 0;

    if (!comentariosVisiveis.length) {
      el["lista-comentarios"].innerHTML = `
        <div class="comentarios-vazio">
          ${hashDocumentoAtual
            ? "Nenhum comentário neste texto.<br>Selecione um trecho no leitor para começar."
            : "Carregue um texto para ver e criar comentários."}
        </div>
      `;
      return;
    }

    el["lista-comentarios"].innerHTML = comentariosVisiveis.map((comentario) => `
      <div class="comentario-item" data-id="${comentario.id}">
        <button type="button" class="ci-abrir" data-id="${comentario.id}" aria-label="Ir para o trecho: ${app.modulos.seguranca.escaparHtml(comentario.quote.slice(0, 80))}">
          <span class="ci-quote">${app.modulos.seguranca.escaparHtml(comentario.quote)}</span>
          <span class="ci-texto">${app.modulos.seguranca.escaparHtml(comentario.comment)}</span>
        </button>
        <button type="button" class="ci-apagar" data-id="${comentario.id}" aria-label="Apagar comentário sobre: ${app.modulos.seguranca.escaparHtml(comentario.quote.slice(0, 80))}">✕</button>
      </div>
    `).join("");

    el["lista-comentarios"].querySelectorAll(".ci-abrir").forEach((botao) => {
      botao.addEventListener("click", () => irParaTrechoComentado(Number(botao.dataset.id)));
    });

    el["lista-comentarios"].querySelectorAll(".ci-apagar").forEach((botao) => {
      botao.addEventListener("click", (evento) => {
        evento.stopPropagation();
        apagarComentario(Number(botao.dataset.id));
      });
    });
  }

  function atualizarBotaoMicrofone() {
    const botao = app.elementos["btn-mic"];
    botao.classList.toggle("gravando", microfoneAtivo);
    botao.title = microfoneAtivo ? "Parar transcrição" : "Falar para transcrever";
    botao.setAttribute("aria-label", microfoneAtivo ? "Parar transcrição" : "Falar para transcrever");
    botao.setAttribute("aria-pressed", String(microfoneAtivo));
  }

  function pararMicrofone() {
    microfoneAtivo = false;
    if (reconhecimento) {
      try { reconhecimento.stop(); } catch (_) { /* já estava parado */ }
    }
    atualizarBotaoMicrofone();
  }

  function fecharPopup(devolverFoco = false) {
    const el = app.elementos;
    if (rafPosicionamento) {
      global.cancelAnimationFrame(rafPosicionamento);
      rafPosicionamento = 0;
    }
    el["popup-comentario"].hidden = true;
    el["popup-input"].value = "";
    pararMicrofone();
    selecaoAtual = null;
    if (devolverFoco) app.modulos.notas?.abrirSecao("comentarios", true);
  }

  function salvarComentario() {
    const texto = app.elementos["popup-input"].value.trim();
    if (!texto || !selecaoAtual) return;

    const id = Date.now();
    const comentario = {
      id,
      quote: selecaoAtual.texto,
      comment: texto,
      documento: hashDocumentoAtual || hashTexto(app.elementos["texto-renderizado"].textContent || ""),
      ancora: selecaoAtual.ancora
    };

    comentarios.push(comentario);
    salvarNoNavegador();
    renderizarComentarios();
    destacarTrecho(selecaoAtual.intervalo, id);
    fecharPopup();
    global.getSelection()?.removeAllRanges();
    abrirComentarioNaLateral(id);
  }

  function apagarComentario(id) {
    comentarios = comentarios.filter((comentario) => comentario.id !== id);
    salvarNoNavegador();
    renderizarComentarios();
    app.elementos["texto-renderizado"]
      .querySelectorAll(`mark[data-id="${id}"]`)
      .forEach((marca) => marca.replaceWith(...marca.childNodes));
    app.elementos["texto-renderizado"].normalize();
  }

  async function copiarComentarios() {
    const comentariosVisiveis = comentariosDoDocumentoAtual();
    if (!comentariosVisiveis.length) return;

    const linhas = comentariosVisiveis.map((comentario, indice) =>
      `[${indice + 1}] Trecho: "${comentario.quote}"\n    Comentário: ${comentario.comment}`
    ).join("\n\n");
    const texto = `Meus comentários sobre a sua última mensagem:\n\n${linhas}\n\nPor favor, considere cada comentário no contexto do trecho citado.`;

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API indisponível");
      await navigator.clipboard.writeText(texto);
      app.elementos["copiado-ok"].style.display = "inline";
      global.setTimeout(() => {
        app.elementos["copiado-ok"].style.display = "none";
      }, 2000);
    } catch (_) {
      const areaTemporaria = document.createElement("textarea");
      areaTemporaria.value = texto;
      areaTemporaria.setAttribute("readonly", "");
      areaTemporaria.style.position = "fixed";
      areaTemporaria.style.opacity = "0";
      document.body.appendChild(areaTemporaria);
      areaTemporaria.select();

      let copiado = false;
      try { copiado = document.execCommand("copy"); } catch (_) { /* fallback indisponível */ }
      areaTemporaria.remove();

      if (!copiado) {
        app.elementos.status.textContent = "Não foi possível copiar os comentários automaticamente.";
        return;
      }
      app.elementos["copiado-ok"].style.display = "inline";
      global.setTimeout(() => {
        app.elementos["copiado-ok"].style.display = "none";
      }, 2000);
    }
  }

  function posicionarBotaoSelecao(intervalo) {
    const botao = app.elementos["btn-comentar-flutuante"];
    const retangulo = intervalo.getBoundingClientRect();
    const retanguloLeitor = app.elementos["leitor-viewport"].getBoundingClientRect();
    const player = app.elementos["player-fixo"].getBoundingClientRect();
    const limiteInferior = app.elementos["player-fixo"].hidden ? global.innerHeight : player.top;

    if (
      !retangulo.width ||
      !retangulo.height ||
      retangulo.bottom < retanguloLeitor.top ||
      retangulo.top > retanguloLeitor.bottom
    ) {
      botao.hidden = true;
      return;
    }

    botao.hidden = false;
    const largura = botao.offsetWidth || 140;
    const altura = botao.offsetHeight || 36;
    const esquerda = Math.max(10, Math.min(global.innerWidth - largura - 10, retangulo.left + retangulo.width / 2 - largura / 2));
    let topo = retangulo.bottom + 9;
    if (topo + altura > limiteInferior - 8) topo = Math.max(8, retangulo.top - altura - 9);
    botao.style.left = `${esquerda}px`;
    botao.style.top = `${topo}px`;
  }

  function agendarPosicionamento() {
    if (
      !selecaoAtual ||
      rafPosicionamento ||
      !app.elementos["popup-comentario"].hidden
    ) return;
    rafPosicionamento = global.requestAnimationFrame(() => {
      rafPosicionamento = 0;
      if (selecaoAtual && app.elementos["popup-comentario"].hidden) {
        posicionarBotaoSelecao(selecaoAtual.intervalo);
      }
    });
  }

  function ocultarAcaoSelecao() {
    if (rafPosicionamento) {
      global.cancelAnimationFrame(rafPosicionamento);
      rafPosicionamento = 0;
    }
    app.elementos["btn-comentar-flutuante"].hidden = true;
    if (app.elementos["popup-comentario"].hidden) selecaoAtual = null;
  }

  function abrirCompositor() {
    if (!selecaoAtual) return;
    const el = app.elementos;
    if (rafPosicionamento) {
      global.cancelAnimationFrame(rafPosicionamento);
      rafPosicionamento = 0;
    }
    el["btn-comentar-flutuante"].hidden = true;

    if (app.estado.reproduzindo && !app.estado.emPausa) {
      app.modulos.leitor.alternarPlayPause();
    }

    app.modulos.notas.abrirSecao("comentarios");
    el["popup-quote"].textContent = selecaoAtual.texto;
    el["popup-comentario"].hidden = false;
    el["popup-input"].value = "";
    global.requestAnimationFrame(() => {
      exibirAreaNoMobile(el["popup-comentario"]);
      el["popup-input"].focus({ preventScroll: true });
    });
  }

  function configurarSelecao() {
    const el = app.elementos;

    document.addEventListener("selectionchange", () => {
      const selecao = global.getSelection();
      if (!selecao || selecao.isCollapsed || !selecao.toString().trim()) {
        ocultarAcaoSelecao();
        return;
      }

      try {
        const intervalo = selecao.getRangeAt(0);
        if (!el["texto-renderizado"].contains(intervalo.commonAncestorContainer)) {
          ocultarAcaoSelecao();
          return;
        }

        const texto = selecao.toString().trim();
        if (texto.length < 3) {
          ocultarAcaoSelecao();
          return;
        }

        selecaoAtual = {
          texto,
          intervalo: intervalo.cloneRange(),
          ancora: obterAncora(intervalo)
        };
        agendarPosicionamento();
      } catch (_) {
        ocultarAcaoSelecao();
      }
    });

    document.addEventListener("pointerdown", (evento) => {
      if (
        !el["popup-comentario"].hidden &&
        !el["popup-comentario"].contains(evento.target) &&
        evento.target !== el["btn-comentar-flutuante"]
      ) {
        fecharPopup();
      }
    });

    global.addEventListener("resize", () => {
      if (selecaoAtual && !el["btn-comentar-flutuante"].hidden) agendarPosicionamento();
    });
    global.addEventListener("scroll", () => {
      if (selecaoAtual && !el["btn-comentar-flutuante"].hidden) agendarPosicionamento();
    }, { passive: true });
    el["leitor-viewport"].addEventListener("scroll", () => {
      if (selecaoAtual && !el["btn-comentar-flutuante"].hidden) agendarPosicionamento();
    }, { passive: true });

    el["btn-comentar-flutuante"].addEventListener("pointerdown", (evento) => evento.preventDefault());
    el["btn-comentar-flutuante"].addEventListener("click", abrirCompositor);
    el["popup-salvar"].addEventListener("click", salvarComentario);
    el["popup-cancelar"].addEventListener("click", () => fecharPopup(true));
    el["popup-input"].addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) salvarComentario();
    });
    el["popup-comentario"].addEventListener("keydown", (evento) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      evento.stopPropagation();
      fecharPopup(true);
    });
  }

  function configurarMicrofone() {
    const el = app.elementos;
    const ReconhecimentoDeVoz = global.SpeechRecognition || global.webkitSpeechRecognition;

    if (!ReconhecimentoDeVoz) {
      el["btn-mic"].style.display = "none";
      return;
    }

    reconhecimento = new ReconhecimentoDeVoz();
    reconhecimento.lang = "pt-BR";
    reconhecimento.continuous = true;
    reconhecimento.interimResults = true;

    reconhecimento.onresult = (evento) => {
      let resultadoFinal = "";
      let resultadoParcial = "";

      for (let indice = evento.resultIndex; indice < evento.results.length; indice++) {
        if (evento.results[indice].isFinal) resultadoFinal += evento.results[indice][0].transcript;
        else resultadoParcial += evento.results[indice][0].transcript;
      }

      if (resultadoFinal) textoBase += `${resultadoFinal} `;
      el["popup-input"].value = `${textoBase}${resultadoParcial}`.trimStart();
    };

    reconhecimento.onend = () => {
      if (microfoneAtivo) {
        try { reconhecimento.start(); } catch (_) { /* reinício em andamento */ }
      }
    };

    reconhecimento.onerror = () => {
      microfoneAtivo = false;
      atualizarBotaoMicrofone();
    };

    el["btn-mic"].addEventListener("click", (evento) => {
      evento.stopPropagation();
      microfoneAtivo = !microfoneAtivo;

      if (microfoneAtivo) {
        textoBase = el["popup-input"].value;
        try { reconhecimento.start(); } catch (_) { /* já iniciado */ }
      } else {
        try { reconhecimento.stop(); } catch (_) { /* já parado */ }
      }
      atualizarBotaoMicrofone();
    });
  }

  function inicializar() {
    comentarios = app.modulos.seguranca.lerJsonLocal(CHAVE_COMENTARIOS, []);
    if (!Array.isArray(comentarios)) comentarios = [];
    renderizarComentarios();
    configurarSelecao();
    configurarMicrofone();

    document.addEventListener("leitor:renderizado", (evento) => {
      fecharPopup();
      app.elementos["btn-comentar-flutuante"].hidden = true;
      global.getSelection()?.removeAllRanges();

      const textoDocumento = evento.detail?.texto || "";
      hashDocumentoAtual = hashTexto(textoDocumento);
      migrarComentariosLegados(textoDocumento);
      renderizarComentarios();
      reaplicarMarcacoes();
    });

    app.elementos["btn-limpar-comentarios"].addEventListener("click", () => {
      const comentariosVisiveis = comentariosDoDocumentoAtual();
      if (!comentariosVisiveis.length || !global.confirm("Apagar os comentários deste texto?")) return;
      const idsVisiveis = new Set(comentariosVisiveis.map((comentario) => comentario.id));
      comentarios = comentarios.filter((comentario) => !idsVisiveis.has(comentario.id));
      salvarNoNavegador();
      renderizarComentarios();
      app.elementos["texto-renderizado"].querySelectorAll(".trecho-comentado")
        .forEach((marca) => marca.replaceWith(...marca.childNodes));
      app.elementos["texto-renderizado"].normalize();
    });

    app.elementos["btn-copiar-comentarios"].addEventListener("click", copiarComentarios);
  }

  app.modulos.comentarios = {
    inicializar,
    reaplicarMarcacoes
  };
})(window.LeitorClaude, window);
