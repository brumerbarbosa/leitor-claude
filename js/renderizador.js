(function registrarRenderizador(app, global) {
  "use strict";

  const LIMITE_SEGMENTO = 240;
  /* O realce da palavra falada usa a Custom Highlight API: pinta sem alterar o DOM,
     preservando marcações de comentário e as âncoras salvas por offset. */
  const SUPORTA_REALCE = typeof global.Highlight === "function"
    && typeof global.CSS !== "undefined"
    && Boolean(global.CSS.highlights);
  const NOME_REALCE = "palavra-lendo";
  const JANELA_BUSCA = 14;
  let prefereMovimentoReduzido = false;
  let realcePalavra = null;
  let slotsPalavras = [];
  let tokensSegmento = [];
  let mapaSegmento = [];
  let elidKaraoke = null;

  /*
   * Marcadores da área de uso privado do Unicode isolam código e endereços de link
   * antes das regras de ênfase, para que `_` ou `*` internos não os quebrem.
   */
  const MARCA_INICIO = String.fromCharCode(0xE000);
  const MARCA_FIM = String.fromCharCode(0xE001);
  const PADRAO_LINK = /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
  const PADRAO_RESERVADO = new RegExp(`${MARCA_INICIO}([0-9]+)${MARCA_FIM}`, "g");

  function urlSegura(url) {
    return /^(https?:|mailto:)/i.test(url) || url.startsWith("#") || url.startsWith("/");
  }

  function processarInline(texto) {
    const reservados = [];
    const reservar = (valor) => `${MARCA_INICIO}${reservados.push(valor) - 1}${MARCA_FIM}`;

    return app.modulos.seguranca.escaparHtml(texto)
      .replace(/`([^`\n]+)`/g, (_, codigo) => reservar(`<code>${codigo}</code>`))
      .replace(PADRAO_LINK, (original, rotulo, destino) => {
        /* Endereços fora de http, https, mailto ou internos seguem como texto comum. */
        if (!urlSegura(destino)) return original;
        /* A tag inteira fica reservada: `_blank` e `noopener` não podem virar ênfase. */
        const abertura = reservar(`<a href="${destino}" target="_blank" rel="noopener noreferrer">`);
        return `${abertura}${rotulo}${reservar("</a>")}`;
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(PADRAO_RESERVADO, (_, indice) => reservados[Number(indice)]);
  }

  function processarTokenCodigo(codigo) {
    if (/^[a-zA-Z][a-zA-Z0-9]+$/.test(codigo) && /[A-Z]/.test(codigo.slice(1))) {
      const separado = codigo
        .replace(/([a-z\d])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
      return `{${separado}}`;
    }

    if (/^[a-z][a-z0-9_]{2,}$/.test(codigo) && codigo.includes("_")) {
      return `{${codigo.replace(/_/g, " ")}}`;
    }

    return codigo;
  }

  function removerMarkdownInline(texto) {
    return texto
      .replace(/`([^`\n]+)`/g, (_, codigo) => processarTokenCodigo(codigo))
      .replace(PADRAO_LINK, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1");
  }

  function extrairCelulas(linha, transformador) {
    const partes = linha.split("|");
    return partes
      .map((celula) => transformador(celula.trim()))
      .filter((_, indice) => indice > 0 && indice < partes.length - 1);
  }

  function renderizarTabela(linhas) {
    const linhasDeDados = linhas
      .filter((linha) => !/^\|[\s|:-]+\|$/.test(linha))
      .map((linha) => extrairCelulas(linha, processarInline));

    if (!linhasDeDados.length) return "";

    const [cabecalho, ...dados] = linhasDeDados;
    let html = `<table><thead><tr>${cabecalho.map((celula) => `<th>${celula}</th>`).join("")}</tr></thead><tbody>`;
    dados.forEach((linha) => {
      html += `<tr>${linha.map((celula) => `<td>${celula}</td>`).join("")}</tr>`;
    });
    return `${html}</tbody></table>`;
  }

  function converterTabelaParaVoz(linhas) {
    const linhasDeDados = linhas
      .filter((linha) => !/^\|[\s|:-]+\|$/.test(linha))
      .map((linha) => extrairCelulas(linha, removerMarkdownInline));

    if (linhasDeDados.length < 2) return "";

    const [cabecalho, ...dados] = linhasDeDados;
    return `${dados.map((linha) => {
      const rotulo = linha[0] || "";
      const valores = linha
        .slice(1)
        .map((valor, indice) => `${(cabecalho[indice + 1] || "").toLowerCase()} ${valor}`)
        .join(", ");
      return rotulo ? `${rotulo}: ${valores}` : valores;
    }).join(". ")}.`;
  }

  function quebrarSegmentoLongo(texto) {
    if (texto.length <= LIMITE_SEGMENTO) return [texto];

    const partes = (texto.match(/[^,;:]+(?:[,;:]|$)/g) || [texto])
      .map((parte) => parte.trim())
      .filter(Boolean);
    const segmentos = [];
    let atual = "";

    partes.forEach((parte) => {
      const candidato = atual ? `${atual} ${parte}` : parte;
      if (candidato.length <= LIMITE_SEGMENTO) {
        atual = candidato;
        return;
      }

      if (atual) segmentos.push(atual);
      atual = "";

      if (parte.length <= LIMITE_SEGMENTO) {
        atual = parte;
        return;
      }

      const palavras = parte.split(/\s+/);
      palavras.forEach((palavra) => {
        const trecho = atual ? `${atual} ${palavra}` : palavra;
        if (trecho.length > LIMITE_SEGMENTO && atual) {
          segmentos.push(atual);
          atual = palavra;
        } else {
          atual = trecho;
        }
      });
    });

    if (atual) segmentos.push(atual);
    return segmentos;
  }

  function segmentarParaVoz(texto) {
    const normalizado = texto.replace(/\s+/g, " ").trim();
    if (!normalizado) return [];

    let sentencas;
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const segmentador = new Intl.Segmenter("pt-BR", { granularity: "sentence" });
      sentencas = Array.from(segmentador.segment(normalizado), (item) => item.segment.trim());
    } else {
      sentencas = normalizado.match(/[^.!?…]+(?:[.!?…]+(?=\s|$)|$)/g) || [normalizado];
    }

    return sentencas
      .filter(Boolean)
      .flatMap(quebrarSegmentoLongo)
      .map((segmento) => app.modulos.leitor.prepararTexto(segmento))
      .filter(Boolean);
  }

  function encontrarPalavras(texto) {
    const regex = /[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu;
    const achados = [];
    let achado;
    while ((achado = regex.exec(texto)) !== null) {
      achados.push({ texto: achado[0], inicio: achado.index, fim: achado.index + achado[0].length });
    }
    return achados;
  }

  function normalizarPalavra(texto) {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function mapearPalavrasDoElemento(elemento) {
    const walker = document.createTreeWalker(elemento, NodeFilter.SHOW_TEXT);
    const slots = [];

    while (walker.nextNode()) {
      const no = walker.currentNode;
      encontrarPalavras(no.textContent).forEach((palavra) => {
        slots.push({
          no,
          inicio: palavra.inicio,
          fim: palavra.fim,
          chave: normalizarPalavra(palavra.texto)
        });
      });
    }

    return slots;
  }

  /*
   * O texto falado não é idêntico ao texto na tela (o Markdown sai e o código vira
   * palavras separadas), então o alinhamento avança por comparação de palavras, com
   * uma janela de busca. Uma palavra sem correspondência apenas fica sem realce.
   */
  function alinharSegmento(frase, slots, cursorInicial) {
    const tokens = encontrarPalavras(frase || "").map((palavra) => ({
      inicio: palavra.inicio,
      fim: palavra.fim,
      chave: normalizarPalavra(palavra.texto)
    }));
    const mapa = [];
    let cursor = cursorInicial;
    let acumulado = "";

    tokens.forEach((token) => {
      const slotNoCursor = slots[cursor];

      /* Uma palavra da tela pode virar várias na fala (código): realça o token inteiro. */
      if (slotNoCursor && slotNoCursor.chave !== token.chave
        && slotNoCursor.chave.startsWith(acumulado + token.chave)) {
        acumulado += token.chave;
        mapa.push(cursor);
        if (acumulado === slotNoCursor.chave) {
          cursor++;
          acumulado = "";
        }
        return;
      }

      acumulado = "";
      const limite = Math.min(slots.length, cursor + JANELA_BUSCA);
      let encontrado = -1;

      for (let indice = cursor; indice < limite; indice++) {
        if (slots[indice].chave === token.chave) {
          encontrado = indice;
          break;
        }
      }

      mapa.push(encontrado);
      if (encontrado >= 0) cursor = encontrado + 1;
    });

    return { tokens, mapa, cursor };
  }

  function limparPalavra() {
    realcePalavra?.clear();
    elidKaraoke = null;
  }

  function prepararKaraoke(indice) {
    if (!SUPORTA_REALCE) return;
    slotsPalavras = [];
    tokensSegmento = [];
    mapaSegmento = [];

    const estado = app.estado;
    const idElemento = estado.fraseParaElemento[indice];
    if (idElemento === undefined) return;

    /* O preenchimento continua entre trechos do mesmo bloco e reinicia ao trocar de bloco. */
    if (idElemento !== elidKaraoke) {
      limparPalavra();
      elidKaraoke = idElemento;
    }

    const elemento = app.elementos["texto-renderizado"].querySelector(`[data-elid="${idElemento}"]`);
    if (!elemento) return;

    /* Recalculado por trecho: uma marcação de comentário pode ter dividido os nós de texto. */
    slotsPalavras = mapearPalavrasDoElemento(elemento);

    let cursor = 0;
    for (let anterior = estado.fraseParaElemento.indexOf(idElemento); anterior < indice; anterior++) {
      cursor = alinharSegmento(estado.frases[anterior], slotsPalavras, cursor).cursor;
    }

    const alinhamento = alinharSegmento(estado.frases[indice], slotsPalavras, cursor);
    tokensSegmento = alinhamento.tokens;
    mapaSegmento = alinhamento.mapa;
  }

  function destacarPalavra(posicaoNoTexto) {
    if (!SUPORTA_REALCE || !tokensSegmento.length || !slotsPalavras.length) return;

    const posicao = Number(posicaoNoTexto) || 0;
    const indicePalavra = tokensSegmento.findIndex((token) => posicao < token.fim);
    const slot = indicePalavra >= 0 ? slotsPalavras[mapaSegmento[indicePalavra]] : null;

    /* Sem correspondência, o preenchimento anterior permanece em vez de piscar. */
    if (!slot) return;

    const primeira = slotsPalavras[0];

    try {
      const intervalo = document.createRange();
      intervalo.setStart(primeira.no, primeira.inicio);
      intervalo.setEnd(slot.no, slot.fim);
      if (!realcePalavra) {
        realcePalavra = new global.Highlight();
        global.CSS.highlights.set(NOME_REALCE, realcePalavra);
      }
      realcePalavra.clear();
      realcePalavra.add(intervalo);
    } catch (_) {
      /* O nó pode ter sido substituído; o próximo trecho refaz o mapeamento. */
      limparPalavra();
    }
  }

  function atualizarBotaoAcompanhamento() {
    const ativo = app.estado.seguindoLeitura;
    const botao = app.elementos["btn-acompanhar"];
    botao.hidden = ativo || !app.estado.frases.length;
    app.elementos["acompanhar-label"].textContent = "Sincronizar";
  }

  function rolarElementoNoLeitor(elemento, centralizar = false, indiceFrase = null) {
    const viewport = app.elementos["leitor-viewport"];
    if (!viewport || !elemento) return;

    const caixaViewport = viewport.getBoundingClientRect();
    const caixaElemento = elemento.getBoundingClientRect();
    const limiteSuperior = caixaViewport.top + caixaViewport.height * 0.18;
    const limiteInferior = caixaViewport.top + caixaViewport.height * 0.76;
    const elementoAlto = elemento.offsetHeight > viewport.clientHeight * 0.76;
    let pontoDoTrecho = null;

    if (elementoAlto && Number.isInteger(indiceFrase)) {
      const idElemento = app.estado.fraseParaElemento[indiceFrase];
      const primeiro = app.estado.fraseParaElemento.indexOf(idElemento);
      const ultimo = app.estado.fraseParaElemento.lastIndexOf(idElemento);
      const quantidade = Math.max(1, ultimo - primeiro + 1);
      const posicao = Math.max(0, Math.min(indiceFrase - primeiro, quantidade - 1));
      pontoDoTrecho = caixaElemento.top + caixaElemento.height * ((posicao + 0.5) / quantidade);
    }

    const foraDaFaixa = pontoDoTrecho === null
      ? caixaElemento.top < limiteSuperior || caixaElemento.bottom > limiteInferior
      : pontoDoTrecho < limiteSuperior || pontoDoTrecho > limiteInferior;

    if (!centralizar && !foraDaFaixa) return;

    const deslocamento = (pontoDoTrecho ?? caixaElemento.top) - caixaViewport.top;
    const destino = pontoDoTrecho !== null
      ? viewport.scrollTop + deslocamento - viewport.clientHeight * 0.32
      : elementoAlto
        ? viewport.scrollTop + deslocamento - viewport.clientHeight * 0.14
      : viewport.scrollTop + deslocamento - (viewport.clientHeight - elemento.offsetHeight) / 2;
    viewport.scrollTo({
      top: Math.max(0, destino),
      behavior: prefereMovimentoReduzido ? "auto" : "smooth"
    });
  }

  function definirAcompanhamento(ativo, reposicionar = true) {
    app.estado.seguindoLeitura = Boolean(ativo);
    atualizarBotaoAcompanhamento();

    if (ativo && reposicionar && app.estado.frases.length) {
      const idElemento = app.estado.fraseParaElemento[app.estado.indiceAtual];
      const elemento = app.elementos["texto-renderizado"].querySelector(`[data-elid="${idElemento}"]`);
      rolarElementoNoLeitor(elemento, true, app.estado.indiceAtual);
    }
  }

  function renderizar(texto) {
    const el = app.elementos;
    const estado = app.estado;
    const linhas = texto.split("\n");
    const partesHtml = [];
    let emListaNaoOrdenada = false;
    let emListaOrdenada = false;
    let contadorElementos = 0;
    let indiceLinha = 0;

    limparPalavra();
    slotsPalavras = [];
    tokensSegmento = [];
    mapaSegmento = [];
    estado.frases = [];
    estado.fraseParaElemento = [];
    estado.elementosRenderizados = [];
    estado.indiceAtual = 0;
    estado.finalizado = false;

    function fecharListas() {
      if (emListaNaoOrdenada) {
        partesHtml.push("</ul>");
        emListaNaoOrdenada = false;
      }
      if (emListaOrdenada) {
        partesHtml.push("</ol>");
        emListaOrdenada = false;
      }
    }

    function registrarTextoFalado(idElemento, textoPlano) {
      segmentarParaVoz(textoPlano).forEach((segmento) => {
        estado.fraseParaElemento.push(idElemento);
        estado.frases.push(segmento);
      });
    }

    function adicionarElemento(tag, conteudoHtml, textoPlano, atributoExtra = "") {
      const idElemento = contadorElementos++;
      registrarTextoFalado(idElemento, textoPlano.trim());
      const atributos = atributoExtra ? ` ${atributoExtra}` : "";
      partesHtml.push(`<${tag} data-elid="${idElemento}"${atributos}>${conteudoHtml}</${tag}>`);
    }

    while (indiceLinha < linhas.length) {
      const linhaOriginal = linhas[indiceLinha];
      const linha = linhaOriginal.trim();

      if (!linha || /^[-*]{3,}$/.test(linha)) {
        fecharListas();
        indiceLinha++;
        continue;
      }

      if (linha.startsWith("```")) {
        fecharListas();
        const idioma = linha.slice(3).trim().split(/\s+/)[0] || "";
        const linhasCodigo = [];
        indiceLinha++;

        while (indiceLinha < linhas.length && !linhas[indiceLinha].trim().startsWith("```")) {
          linhasCodigo.push(linhas[indiceLinha]);
          indiceLinha++;
        }
        indiceLinha++;

        while (linhasCodigo.length && !linhasCodigo[linhasCodigo.length - 1].trim()) linhasCodigo.pop();
        const total = linhasCodigo.length;
        /* A voz anuncia o bloco; o código fica na tela como referência, recolhido. */
        const descricao = `Bloco de código${idioma ? ` em ${idioma}` : ""} com ${total} ${total === 1 ? "linha" : "linhas"}`;
        const idElemento = contadorElementos++;
        registrarTextoFalado(idElemento, descricao);
        const escapar = app.modulos.seguranca.escaparHtml;
        partesHtml.push(
          `<div data-elid="${idElemento}" class="bloco-codigo">`
          + `<details><summary>${escapar(descricao)}</summary>`
          + `<pre><code>${escapar(linhasCodigo.join("\n"))}</code></pre>`
          + "</details></div>"
        );
        continue;
      }

      const titulo = linha.match(/^(#{1,6})\s+(.*)/);
      if (titulo) {
        fecharListas();
        const nivel = Math.min(titulo[1].length + 1, 4);
        adicionarElemento(`h${nivel}`, processarInline(titulo[2]), removerMarkdownInline(titulo[2]));
        indiceLinha++;
        continue;
      }

      if (linha.startsWith("|")) {
        fecharListas();
        const blocoTabela = [];
        while (indiceLinha < linhas.length && linhas[indiceLinha].trim().startsWith("|")) {
          blocoTabela.push(linhas[indiceLinha].trim());
          indiceLinha++;
        }

        const idElemento = contadorElementos++;
        registrarTextoFalado(idElemento, converterTabelaParaVoz(blocoTabela));
        partesHtml.push(`<div data-elid="${idElemento}">${renderizarTabela(blocoTabela)}</div>`);
        continue;
      }

      if (/^[-*]\s/.test(linha)) {
        if (emListaOrdenada) {
          partesHtml.push("</ol>");
          emListaOrdenada = false;
        }
        if (!emListaNaoOrdenada) {
          partesHtml.push("<ul>");
          emListaNaoOrdenada = true;
        }
        const textoItem = linha.replace(/^[-*]\s+/, "");
        adicionarElemento("li", processarInline(textoItem), removerMarkdownInline(textoItem));
        indiceLinha++;
        continue;
      }

      if (/^\d+\.\s/.test(linha)) {
        if (emListaNaoOrdenada) {
          partesHtml.push("</ul>");
          emListaNaoOrdenada = false;
        }
        if (!emListaOrdenada) {
          partesHtml.push("<ol>");
          emListaOrdenada = true;
        }
        const textoItem = linha.replace(/^\d+\.\s+/, "");
        adicionarElemento("li", processarInline(textoItem), removerMarkdownInline(textoItem));
        indiceLinha++;
        continue;
      }

      if (/^>\s?/.test(linha)) {
        fecharListas();
        const textoCitacao = linha.replace(/^>\s?/, "");
        adicionarElemento("blockquote", processarInline(textoCitacao), removerMarkdownInline(textoCitacao));
        indiceLinha++;
        continue;
      }

      fecharListas();
      adicionarElemento("p", processarInline(linha), removerMarkdownInline(linha));
      indiceLinha++;
    }

    fecharListas();
    el["texto-renderizado"].innerHTML = partesHtml.join("");

    const primeiroTitulo = el["texto-renderizado"].querySelector("h1, h2, h3, h4")?.textContent.trim();
    const tituloLeitura = primeiroTitulo || estado.frases[0]?.slice(0, 72) || "Texto preparado";
    el["entrada-resumo-titulo"].textContent = tituloLeitura;
    el["leitura-titulo"].textContent = tituloLeitura;

    estado.elementosRenderizados = Array.from(el["texto-renderizado"].querySelectorAll("[data-elid]"));
    estado.elementosRenderizados.forEach((elemento) => {
      elemento.title = "Clique para ouvir daqui";
    });
    el["leitor-viewport"].scrollTop = 0;
    definirAcompanhamento(true, false);

    el.status.textContent = estado.frases.length
      ? `${estado.frases.length} trechos preparados — clique em qualquer bloco para começar dali.`
      : "Nenhum trecho disponível para leitura.";

    app.modulos.leitor.documentoAtualizado();
    document.dispatchEvent(new CustomEvent("leitor:renderizado", {
      detail: { texto: el["texto-renderizado"].textContent || "" }
    }));
  }

  function destacar(indice, forcarRolagem = false) {
    limparDestaque();
    const idElemento = app.estado.fraseParaElemento[indice];
    if (idElemento === undefined) return;

    const elemento = app.elementos["texto-renderizado"].querySelector(`[data-elid="${idElemento}"]`);
    if (!elemento) return;

    elemento.classList.add("lendo");
    if (app.estado.seguindoLeitura || forcarRolagem) {
      rolarElementoNoLeitor(elemento, forcarRolagem, indice);
    }
  }

  function limparDestaque() {
    app.estado.elementosRenderizados.forEach((elemento) => elemento.classList.remove("lendo"));
    limparPalavra();
  }

  function inicializar() {
    prefereMovimentoReduzido = global.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
    const viewport = app.elementos["leitor-viewport"];

    /*
     * Um único ouvinte cobre todos os blocos: uma resposta longa gera centenas deles,
     * e registrar um por elemento a cada nova leitura não escala.
     */
    app.elementos["texto-renderizado"].addEventListener("click", (evento) => {
      if (evento.target.closest("mark, .trecho-checkbox, a[href], summary")) return;
      if (app.elementos["texto-renderizado"].classList.contains("modo-selecao-trechos")) return;

      const elemento = evento.target.closest("[data-elid]");
      if (!elemento) return;

      const selecao = global.getSelection();
      if (selecao && !selecao.isCollapsed) return;

      evento.stopPropagation();
      const fraseAlvo = app.estado.fraseParaElemento.indexOf(Number(elemento.dataset.elid));
      definirAcompanhamento(true, false);
      app.modulos.leitor.tocarDe(fraseAlvo >= 0 ? fraseAlvo : 0);
    });

    app.elementos["btn-acompanhar"].addEventListener("click", () => {
      definirAcompanhamento(true);
      viewport.focus({ preventScroll: true });
      app.elementos.status.textContent = "Leitura sincronizada com o trecho atual.";
    });

    viewport.addEventListener("wheel", () => definirAcompanhamento(false, false), { passive: true });
    viewport.addEventListener("touchmove", () => definirAcompanhamento(false, false), { passive: true });
    viewport.addEventListener("pointerdown", () => definirAcompanhamento(false, false));
    viewport.addEventListener("keydown", (evento) => {
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(evento.key)) return;
      evento.preventDefault();
      /* Com o leitor focado estas teclas rolam o texto; não devem acionar os atalhos globais. */
      evento.stopPropagation();
      definirAcompanhamento(false, false);

      const movimentos = {
        ArrowUp: viewport.scrollTop - 44,
        ArrowDown: viewport.scrollTop + 44,
        PageUp: viewport.scrollTop - viewport.clientHeight * 0.82,
        PageDown: viewport.scrollTop + viewport.clientHeight * 0.82,
        Home: 0,
        End: viewport.scrollHeight
      };
      viewport.scrollTo({ top: movimentos[evento.key], behavior: "auto" });
    });

    atualizarBotaoAcompanhamento();
  }

  app.modulos.renderizador = {
    inicializar,
    renderizar,
    destacar,
    limparDestaque,
    prepararKaraoke,
    destacarPalavra,
    limparPalavra,
    definirAcompanhamento,
    rolarElementoNoLeitor,
    processarInline,
    removerMarkdownInline,
    segmentarParaVoz
  };
})(window.LeitorClaude, window);
