(function registrarRenderizador(app) {
  "use strict";

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
    el["texto-renderizado"].style.display = "block";

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

    function adicionarElemento(tag, conteudoHtml, textoPlano, atributoExtra = "") {
      const idElemento = contadorElementos++;
      const conteudoFalado = textoPlano.trim();

      if (conteudoFalado) {
        estado.fraseParaElemento.push(idElemento);
        estado.frases.push(app.modulos.leitor.prepararTexto(conteudoFalado));
      }

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
        const textoTabela = converterTabelaParaVoz(blocoTabela);
        if (textoTabela.trim()) {
          estado.fraseParaElemento.push(idElemento);
          estado.frases.push(app.modulos.leitor.prepararTexto(textoTabela));
        }
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
        evento.stopPropagation();
        app.modulos.leitor.parar();
        const idElemento = Number(elemento.dataset.elid);
        const fraseAlvo = estado.fraseParaElemento.indexOf(idElemento);
        app.modulos.leitor.tocarDe(fraseAlvo >= 0 ? fraseAlvo : 0);
      });
    });

    estado.elementosRenderizados = Array.from(el["texto-renderizado"].querySelectorAll("[data-elid]"));
    estado.indiceAtual = 0;
    el["btn-play"].disabled = estado.frases.length === 0;
    el["progresso-bar"].style.display = estado.frases.length ? "block" : "none";
    el["progresso-fill"].style.width = "0%";
    el["progresso-bar"].setAttribute("aria-valuenow", "0");
    el.status.textContent = estado.frases.length
      ? `${estado.frases.length} frases — clique em qualquer parágrafo para começar dali`
      : "Nenhum trecho disponível para leitura.";
  }

  function destacar(indice) {
    limparDestaque();
    const idElemento = app.estado.fraseParaElemento[indice];
    if (idElemento === undefined) return;

    const elemento = app.elementos["texto-renderizado"].querySelector(`[data-elid="${idElemento}"]`);
    if (elemento) {
      elemento.classList.add("lendo");
      elemento.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function limparDestaque() {
    app.estado.elementosRenderizados.forEach((elemento) => elemento.classList.remove("lendo"));
  }

  app.modulos.renderizador = {
    renderizar,
    destacar,
    limparDestaque,
    processarInline,
    removerMarkdownInline
  };
})(window.LeitorClaude);
