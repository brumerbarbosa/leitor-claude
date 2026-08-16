(function registrarRenderizador(app, global) {
  "use strict";

  const LIMITE_SEGMENTO = 240;
  let prefereMovimentoReduzido = false;

  function processarInline(texto) {
    return app.modulos.seguranca.escaparHtml(texto)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>");
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

  function atualizarBotaoAcompanhamento() {
    const ativo = app.estado.seguindoLeitura;
    const botao = app.elementos["btn-acompanhar"];
    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
    app.elementos["acompanhar-label"].textContent = ativo
      ? "Acompanhando"
      : "Retomar acompanhamento";
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

    el["texto-renderizado"].querySelectorAll("[data-elid]").forEach((elemento) => {
      elemento.style.cursor = "pointer";
      elemento.title = "Clique para ouvir daqui";
      elemento.addEventListener("click", (evento) => {
        if (evento.target.closest("mark")) return;
        const selecao = global.getSelection();
        if (selecao && !selecao.isCollapsed) return;

        evento.stopPropagation();
        const idElemento = Number(elemento.dataset.elid);
        const fraseAlvo = estado.fraseParaElemento.indexOf(idElemento);
        definirAcompanhamento(true, false);
        app.modulos.leitor.tocarDe(fraseAlvo >= 0 ? fraseAlvo : 0);
      });
    });

    estado.elementosRenderizados = Array.from(el["texto-renderizado"].querySelectorAll("[data-elid]"));
    el["leitor-viewport"].scrollTop = 0;
    el["leitura-workspace"].hidden = false;
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
  }

  function inicializar() {
    prefereMovimentoReduzido = global.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
    const viewport = app.elementos["leitor-viewport"];

    app.elementos["btn-acompanhar"].addEventListener("click", () => {
      definirAcompanhamento(!app.estado.seguindoLeitura);
    });

    viewport.addEventListener("wheel", () => definirAcompanhamento(false, false), { passive: true });
    viewport.addEventListener("touchmove", () => definirAcompanhamento(false, false), { passive: true });
    viewport.addEventListener("pointerdown", () => definirAcompanhamento(false, false));
    viewport.addEventListener("keydown", (evento) => {
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(evento.key)) return;
      evento.preventDefault();
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
    definirAcompanhamento,
    rolarElementoNoLeitor,
    processarInline,
    removerMarkdownInline,
    segmentarParaVoz
  };
})(window.LeitorClaude, window);
