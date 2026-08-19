(function registrarDados(app, global) {
  "use strict";

  const CHAVE_NOTAS = "leitor_notas";
  const CHAVE_COMENTARIOS = "leitor_comentarios";
  const VERSAO_FORMATO = 1;

  function carimboDeData() {
    const agora = new Date();
    const doisDigitos = (valor) => String(valor).padStart(2, "0");
    return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
  }

  function lerNotas() {
    try {
      return localStorage.getItem(CHAVE_NOTAS) || "";
    } catch (_) {
      return "";
    }
  }

  function comentariosDoTextoAtual() {
    const todos = app.modulos.seguranca.lerJsonLocal(CHAVE_COMENTARIOS, []);
    if (!Array.isArray(todos)) return [];
    const documento = app.modulos.comentarios.documentoAtual();
    return documento ? todos.filter((item) => item.documento === documento) : [];
  }

  function baixarArquivo(nome, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: `${tipo};charset=utf-8` }));
    const ligacao = document.createElement("a");
    ligacao.href = url;
    ligacao.download = nome;
    document.body.append(ligacao);
    ligacao.click();
    ligacao.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function montarMarkdown() {
    const notas = lerNotas().trim();
    const comentarios = comentariosDoTextoAtual();
    const titulo = app.elementos["leitura-titulo"].textContent.trim() || "Revisão";
    const partes = [`# Revisão: ${titulo}`, ""];

    if (comentarios.length) {
      partes.push("## Comentários", "");
      comentarios.forEach((comentario, indice) => {
        partes.push(`### ${indice + 1}. Trecho citado`, "");
        comentario.quote.split("\n\n").forEach((trecho) => partes.push(`> ${trecho.trim()}`));
        partes.push("", comentario.comment, "");
      });
    }

    if (notas) partes.push("## Notas", "", notas, "");

    if (!comentarios.length && !notas) partes.push("_Nenhuma nota ou comentário nesta leitura._", "");
    partes.push("---", "Para o assistente: considere cada comentário no contexto do trecho citado acima dele.");
    return partes.join("\n");
  }

  function montarJson() {
    return JSON.stringify({
      versao: VERSAO_FORMATO,
      exportadoEm: new Date().toISOString(),
      titulo: app.elementos["leitura-titulo"].textContent.trim(),
      texto: app.estado.textoCarregado,
      notas: lerNotas(),
      comentarios: comentariosDoTextoAtual()
    }, null, 2);
  }

  function exportarMarkdown() {
    baixarArquivo(`revisao-${carimboDeData()}.md`, montarMarkdown(), "text/markdown");
    app.elementos.status.textContent = "Revisão exportada em Markdown.";
  }

  function exportarJson() {
    baixarArquivo(`leitor-claude-${carimboDeData()}.json`, montarJson(), "application/json");
    app.elementos.status.textContent = "Backup exportado.";
  }

  function validarPacote(dados) {
    if (!dados || typeof dados !== "object") return "O arquivo não tem o formato esperado.";
    if (typeof dados.texto !== "string" && typeof dados.notas !== "string" && !Array.isArray(dados.comentarios)) {
      return "O arquivo não contém texto, notas nem comentários.";
    }
    if (dados.comentarios && !Array.isArray(dados.comentarios)) return "A lista de comentários está corrompida.";
    return "";
  }

  async function importarDeArquivo(arquivo) {
    const el = app.elementos;
    let dados;

    try {
      dados = JSON.parse(await arquivo.text());
    } catch (_) {
      el.status.textContent = `“${arquivo.name}” não é um JSON válido.`;
      return;
    }

    const erro = validarPacote(dados);
    if (erro) {
      el.status.textContent = erro;
      return;
    }

    const comentarios = Array.isArray(dados.comentarios) ? dados.comentarios : [];
    const temNotas = typeof dados.notas === "string" && dados.notas.trim().length > 0;
    const resumo = [
      dados.texto ? "o texto da leitura" : "",
      comentarios.length ? `${comentarios.length} ${comentarios.length === 1 ? "comentário" : "comentários"}` : "",
      temNotas ? "as notas" : ""
    ].filter(Boolean).join(", ");

    const confirmado = await app.modulos.shell.confirmar({
      titulo: "Importar revisão",
      descricao: `Serão restaurados: ${resumo || "nada"}. As notas atuais deste navegador serão substituídas.`,
      acaoRotulo: "Importar"
    });
    if (!confirmado) return;

    if (typeof dados.texto === "string" && dados.texto.trim()) {
      el["input-texto"].value = dados.texto;
      el["input-texto"].dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (temNotas || typeof dados.notas === "string") {
      app.modulos.notas.definirTexto(dados.notas || "");
    }

    const importados = app.modulos.comentarios.mesclar(comentarios);

    if (typeof dados.texto === "string" && dados.texto.trim()) {
      app.modulos.entrada.prepararNovaLeitura(dados.texto.trim());
    } else {
      app.modulos.comentarios.recarregar();
    }

    el.status.textContent = `Revisão importada: ${importados} ${importados === 1 ? "comentário" : "comentários"}.`;
  }

  function inicializar() {
    const el = app.elementos;
    const comMenuFechado = (acao) => () => {
      app.modulos.shell.definirMenuAjustesAberto(false);
      acao();
    };

    el["ajuste-exportar-md"].addEventListener("click", comMenuFechado(exportarMarkdown));
    el["ajuste-exportar-json"].addEventListener("click", comMenuFechado(exportarJson));
    el["ajuste-importar"].addEventListener("click", comMenuFechado(() => el["arquivo-importar"].click()));
    el["arquivo-importar"].addEventListener("change", async (evento) => {
      const arquivo = evento.target.files?.[0];
      evento.target.value = "";
      if (arquivo) await importarDeArquivo(arquivo);
    });
  }

  app.modulos.dados = {
    inicializar,
    exportarMarkdown,
    exportarJson,
    montarMarkdown,
    montarJson
  };
})(window.LeitorClaude, window);
