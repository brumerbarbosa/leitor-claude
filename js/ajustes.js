(function registrarAjustes(app, global) {
  "use strict";

  let rascunho = null;

  function contarRemovidas(configuracao) {
    const texto = app.estado.textoCarregado;
    if (!texto) return null;
    return app.modulos.filtro.filtrarLinhas(texto, configuracao).removidas.length;
  }

  function atualizarPrevia() {
    const quantidade = contarRemovidas(rascunho);
    const previa = app.elementos["filtro-previa"];

    if (quantidade === null) {
      previa.textContent = "Carregue um texto para ver quantas linhas seriam removidas.";
      return;
    }

    previa.textContent = quantidade === 0
      ? "Com estes ajustes, nenhuma linha do texto atual seria removida."
      : `Com estes ajustes, ${quantidade} ${quantidade === 1 ? "linha seria removida" : "linhas seriam removidas"} do texto atual.`;
  }

  function renderizarTermos() {
    const lista = app.elementos["filtro-lista-termos"];
    lista.replaceChildren();

    if (!rascunho.termos.length) {
      const vazio = document.createElement("li");
      vazio.className = "filtro-termo-vazio";
      vazio.textContent = "Nenhum termo personalizado.";
      lista.append(vazio);
      return;
    }

    rascunho.termos.forEach((termo, indice) => {
      const item = document.createElement("li");
      item.className = "filtro-termo";

      const rotulo = document.createElement("span");
      rotulo.textContent = termo;

      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "filtro-termo-remover";
      remover.setAttribute("aria-label", `Remover o termo ${termo}`);
      remover.innerHTML = '<i class="icone icone-pequeno" data-icon="x" aria-hidden="true"></i>';
      remover.addEventListener("click", () => {
        rascunho.termos.splice(indice, 1);
        renderizarTermos();
        atualizarPrevia();
      });

      item.append(rotulo, remover);
      lista.append(item);
    });
  }

  function renderizarCategorias() {
    const area = app.elementos["filtro-categorias"];
    area.replaceChildren();

    app.modulos.filtro.CATEGORIAS.forEach((categoria) => {
      const item = document.createElement("label");
      item.className = "filtro-categoria";

      const caixa = document.createElement("input");
      caixa.type = "checkbox";
      caixa.checked = rascunho[categoria.id] !== false;
      caixa.addEventListener("change", () => {
        rascunho[categoria.id] = caixa.checked;
        atualizarPrevia();
      });

      const texto = document.createElement("span");
      const titulo = document.createElement("strong");
      titulo.textContent = categoria.rotulo;
      const exemplo = document.createElement("small");
      exemplo.textContent = categoria.exemplo;
      texto.append(titulo, exemplo);

      item.append(caixa, texto);
      area.append(item);
    });
  }

  function adicionarTermo() {
    const campo = app.elementos["filtro-termo-novo"];
    const termo = campo.value.trim();
    if (!termo) return;

    if (!rascunho.termos.some((existente) => existente.toLowerCase() === termo.toLowerCase())) {
      rascunho.termos.push(termo);
    }

    campo.value = "";
    campo.focus({ preventScroll: true });
    renderizarTermos();
    atualizarPrevia();
  }

  function abrir() {
    const dialogo = app.elementos["dialogo-filtro"];
    if (!dialogo?.showModal) return;

    rascunho = app.modulos.filtro.obterConfiguracao();
    renderizarCategorias();
    renderizarTermos();
    atualizarPrevia();
    dialogo.showModal();
    app.elementos["filtro-salvar"].focus({ preventScroll: true });
  }

  function aplicar() {
    app.modulos.filtro.definirConfiguracao(rascunho);
    app.elementos["dialogo-filtro"].close();

    /* O texto original é refiltrado para que a mudança valha na leitura atual. */
    const original = app.estado.textoCarregado;
    if (original) {
      app.modulos.entrada.prepararNovaLeitura(original, { tocar: false });
      app.elementos.status.textContent = "Filtro atualizado nesta leitura.";
    } else {
      app.elementos.status.textContent = "Filtro atualizado.";
    }
  }

  function inicializar() {
    const el = app.elementos;
    app.modulos.filtro.carregarConfiguracao();
    if (!el["dialogo-filtro"]) return;

    el["ajuste-filtro"].addEventListener("click", () => {
      app.modulos.shell.definirMenuAjustesAberto(false);
      abrir();
    });

    el["filtro-termo-adicionar"].addEventListener("click", adicionarTermo);
    el["filtro-termo-novo"].addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter") return;
      evento.preventDefault();
      adicionarTermo();
    });

    el["filtro-restaurar"].addEventListener("click", () => {
      rascunho = { ...app.modulos.filtro.PADRAO, termos: [] };
      renderizarCategorias();
      renderizarTermos();
      atualizarPrevia();
    });

    el["filtro-cancelar"].addEventListener("click", () => el["dialogo-filtro"].close());
    el["filtro-salvar"].addEventListener("click", aplicar);
  }

  app.modulos.ajustes = {
    inicializar,
    abrir
  };
})(window.LeitorClaude, window);
