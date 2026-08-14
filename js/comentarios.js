(function registrarComentarios(app, global) {
  "use strict";

  const CHAVE_COMENTARIOS = "leitor_comentarios";
  let comentarios = [];
  let selecaoAtual = null;
  let reconhecimento = null;
  let microfoneAtivo = false;
  let textoBase = "";

  function salvarNoNavegador() {
    localStorage.setItem(CHAVE_COMENTARIOS, JSON.stringify(comentarios));
  }

  function renderizarComentarios() {
    const el = app.elementos;
    if (!comentarios.length) {
      el["painel-comentarios"].style.display = "none";
      return;
    }

    el["painel-comentarios"].style.display = "block";
    el["lista-comentarios"].innerHTML = comentarios.map((comentario) => `
      <div class="comentario-item" data-id="${comentario.id}">
        <div class="ci-quote">${app.modulos.seguranca.escaparHtml(comentario.quote)}</div>
        <div class="ci-texto">${app.modulos.seguranca.escaparHtml(comentario.comment)}</div>
        <button type="button" class="ci-apagar" data-id="${comentario.id}" aria-label="Apagar comentário">✕</button>
      </div>
    `).join("");

    el["lista-comentarios"].querySelectorAll(".ci-apagar").forEach((botao) => {
      botao.addEventListener("click", () => apagarComentario(Number(botao.dataset.id)));
    });
  }

  function criarMarcacao(id) {
    const marca = document.createElement("mark");
    marca.className = "trecho-comentado";
    marca.dataset.id = String(id);
    marca.title = "Clique para ver comentário";
    marca.addEventListener("click", () => {
      const comentario = document.querySelector(`.comentario-item[data-id="${id}"]`);
      if (!comentario) return;
      comentario.scrollIntoView({ behavior: "smooth", block: "center" });
      comentario.style.borderColor = "#fd79a8";
      global.setTimeout(() => {
        comentario.style.borderColor = "#6c5ce7";
      }, 1200);
    });
    return marca;
  }

  function destacarTrecho(intervalo, id) {
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

  function fecharPopup() {
    const el = app.elementos;
    el["popup-comentario"].style.display = "none";
    el["popup-input"].value = "";
    el["btn-comentar-flutuante"].style.display = "";

    if (microfoneAtivo && reconhecimento) {
      microfoneAtivo = false;
      try { reconhecimento.stop(); } catch (_) { /* já estava parado */ }
      el["btn-mic"].classList.remove("gravando");
      el["btn-mic"].title = "Falar para transcrever";
    }
  }

  function salvarComentario() {
    const texto = app.elementos["popup-input"].value.trim();
    if (!texto || !selecaoAtual) {
      fecharPopup();
      return;
    }

    const id = Date.now();
    comentarios.push({ id, quote: selecaoAtual.texto, comment: texto });
    salvarNoNavegador();
    renderizarComentarios();
    destacarTrecho(selecaoAtual.intervalo, id);
    fecharPopup();
    global.getSelection()?.removeAllRanges();
  }

  function apagarComentario(id) {
    comentarios = comentarios.filter((comentario) => comentario.id !== id);
    salvarNoNavegador();
    renderizarComentarios();
    app.elementos["texto-renderizado"]
      .querySelectorAll(`mark[data-id="${id}"]`)
      .forEach((marca) => marca.replaceWith(...marca.childNodes));
  }

  async function copiarComentarios() {
    if (!comentarios.length) return;

    const linhas = comentarios.map((comentario, indice) =>
      `[${indice + 1}] Trecho: "${comentario.quote}"\n    Comentário: ${comentario.comment}`
    ).join("\n\n");
    const texto = `Meus comentários sobre a sua última mensagem:\n\n${linhas}\n\nPor favor, considere cada comentário no contexto do trecho citado.`;

    try {
      await navigator.clipboard.writeText(texto);
      app.elementos["copiado-ok"].style.display = "inline";
      global.setTimeout(() => {
        app.elementos["copiado-ok"].style.display = "none";
      }, 2000);
    } catch (_) {
      app.elementos.status.textContent = "Não foi possível copiar os comentários automaticamente.";
    }
  }

  function configurarSelecao() {
    const el = app.elementos;

    document.addEventListener("selectionchange", () => {
      const selecao = global.getSelection();
      if (!selecao || selecao.isCollapsed || !selecao.toString().trim()) {
        el["btn-comentar-flutuante"].classList.remove("ativo");
        return;
      }

      try {
        const intervalo = selecao.getRangeAt(0);
        if (!el["texto-renderizado"].contains(intervalo.commonAncestorContainer)) {
          el["btn-comentar-flutuante"].classList.remove("ativo");
          return;
        }

        const texto = selecao.toString().trim();
        if (texto.length < 3) {
          el["btn-comentar-flutuante"].classList.remove("ativo");
          return;
        }

        selecaoAtual = { texto, intervalo: intervalo.cloneRange() };
        el["btn-comentar-flutuante"].classList.add("ativo");
      } catch (_) {
        el["btn-comentar-flutuante"].classList.remove("ativo");
      }
    });

    document.addEventListener("mousedown", (evento) => {
      if (!el["popup-comentario"].contains(evento.target) && evento.target !== el["btn-comentar-flutuante"]) {
        fecharPopup();
      }
    });

    el["btn-comentar-flutuante"].addEventListener("click", () => {
      if (!selecaoAtual) return;
      el["btn-comentar-flutuante"].style.display = "none";

      const sintese = global.speechSynthesis;
      if (sintese?.speaking && !sintese.paused) {
        app.modulos.leitor.alternarPlayPause();
      }

      el["popup-quote"].textContent = selecaoAtual.texto;
      el["popup-comentario"].style.bottom = "70px";
      el["popup-comentario"].style.left = "20px";
      el["popup-comentario"].style.top = "auto";
      el["popup-comentario"].style.display = "block";
      el["popup-input"].value = "";
      el["popup-input"].focus();
    });

    el["popup-salvar"].addEventListener("click", salvarComentario);
    el["popup-cancelar"].addEventListener("click", fecharPopup);
    el["popup-input"].addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) salvarComentario();
      if (evento.key === "Escape") fecharPopup();
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
      el["btn-mic"].classList.remove("gravando");
      el["btn-mic"].title = "Falar para transcrever";
    };

    el["btn-mic"].addEventListener("click", (evento) => {
      evento.stopPropagation();
      microfoneAtivo = !microfoneAtivo;

      if (microfoneAtivo) {
        textoBase = el["popup-input"].value;
        try { reconhecimento.start(); } catch (_) { /* já iniciado */ }
        el["btn-mic"].classList.add("gravando");
        el["btn-mic"].title = "Parar transcrição";
      } else {
        try { reconhecimento.stop(); } catch (_) { /* já parado */ }
        el["btn-mic"].classList.remove("gravando");
        el["btn-mic"].title = "Falar para transcrever";
      }
    });
  }

  function inicializar() {
    comentarios = app.modulos.seguranca.lerJsonLocal(CHAVE_COMENTARIOS, []);
    if (!Array.isArray(comentarios)) comentarios = [];
    renderizarComentarios();
    configurarSelecao();
    configurarMicrofone();

    app.elementos["btn-limpar-comentarios"].addEventListener("click", () => {
      if (!global.confirm("Apagar todos os comentários?")) return;
      comentarios = [];
      salvarNoNavegador();
      renderizarComentarios();
      app.elementos["texto-renderizado"].querySelectorAll(".trecho-comentado")
        .forEach((marca) => marca.replaceWith(...marca.childNodes));
    });

    app.elementos["btn-copiar-comentarios"].addEventListener("click", copiarComentarios);
  }

  app.modulos.comentarios = {
    inicializar
  };
})(window.LeitorClaude, window);
