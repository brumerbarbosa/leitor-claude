(function registrarNotas(app, global) {
  "use strict";

  const CHAVE_NOTAS = "leitor_notas";
  const CHAVE_PAINEL = "leitor_painel_lateral";
  let recolhido = false;
  let abaAtiva = "notas";

  function lerLocal(chave, padrao = "") {
    try {
      return localStorage.getItem(chave) ?? padrao;
    } catch (_) {
      return padrao;
    }
  }

  function salvarLocal(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (_) {
      app.elementos.status.textContent = "Não foi possível salvar localmente neste navegador.";
    }
  }

  function atualizarContagem() {
    const quantidade = app.elementos["notas-textarea"].value.length;
    app.elementos["notas-chars"].textContent = `${quantidade} ${quantidade === 1 ? "caractere" : "caracteres"}`;
  }

  function aplicarEstadoRecolhido() {
    const el = app.elementos;
    el["painel-lateral"].classList.toggle("recolhido", recolhido);
    el["leitura-workspace"].classList.toggle("painel-recolhido", recolhido);
    el["btn-minimizar"].textContent = recolhido ? "‹" : "›";
    el["btn-minimizar"].title = recolhido ? "Expandir painel" : "Recolher painel";
    el["btn-minimizar"].setAttribute("aria-label", recolhido ? "Expandir painel lateral" : "Recolher painel lateral");
    el["btn-minimizar"].setAttribute("aria-expanded", String(!recolhido));
  }

  function definirRecolhido(valor, persistir = true) {
    recolhido = Boolean(valor);
    aplicarEstadoRecolhido();
    if (persistir) salvarLocal(CHAVE_PAINEL, JSON.stringify({ recolhido, abaAtiva }));
  }

  function abrirAba(nome, focar = false) {
    const el = app.elementos;
    const comentarios = nome === "comentarios";
    abaAtiva = comentarios ? "comentarios" : "notas";

    el["tab-notas"].classList.toggle("ativo", !comentarios);
    el["tab-comentarios"].classList.toggle("ativo", comentarios);
    el["tab-notas"].setAttribute("aria-selected", String(!comentarios));
    el["tab-comentarios"].setAttribute("aria-selected", String(comentarios));
    el["tab-notas"].tabIndex = comentarios ? -1 : 0;
    el["tab-comentarios"].tabIndex = comentarios ? 0 : -1;
    el["painel-notas"].hidden = comentarios;
    el["painel-comentarios"].hidden = !comentarios;

    if (recolhido) definirRecolhido(false, false);
    salvarLocal(CHAVE_PAINEL, JSON.stringify({ recolhido, abaAtiva }));
    if (focar) (comentarios ? el["tab-comentarios"] : el["tab-notas"]).focus();
  }

  function configurarAbas() {
    const el = app.elementos;
    el["tab-notas"].addEventListener("click", () => abrirAba("notas"));
    el["tab-comentarios"].addEventListener("click", () => abrirAba("comentarios"));

    [el["tab-notas"], el["tab-comentarios"]].forEach((aba) => {
      aba.addEventListener("keydown", (evento) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
        evento.preventDefault();
        if (evento.key === "Home") {
          abrirAba("notas", true);
          return;
        }
        if (evento.key === "End") {
          abrirAba("comentarios", true);
          return;
        }

        const estaEmNotas = aba === el["tab-notas"];
        abrirAba(estaEmNotas ? "comentarios" : "notas", true);
      });
    });
  }

  function inicializar() {
    const el = app.elementos;
    el["notas-textarea"].value = lerLocal(CHAVE_NOTAS);
    atualizarContagem();

    const estadoSalvo = app.modulos.seguranca.lerJsonLocal(CHAVE_PAINEL, null);
    if (estadoSalvo && typeof estadoSalvo === "object") {
      recolhido = Boolean(estadoSalvo.recolhido);
      abaAtiva = estadoSalvo.abaAtiva === "comentarios" ? "comentarios" : "notas";
    }

    const deveIniciarRecolhido = recolhido;
    recolhido = false;
    abrirAba(abaAtiva);
    definirRecolhido(deveIniciarRecolhido);
    configurarAbas();

    el["notas-textarea"].addEventListener("input", () => {
      salvarLocal(CHAVE_NOTAS, el["notas-textarea"].value);
      atualizarContagem();
    });

    el["btn-minimizar"].addEventListener("click", () => definirRecolhido(!recolhido));

    el["btn-limpar-notas"].addEventListener("click", () => {
      if (!el["notas-textarea"].value || !global.confirm("Limpar todas as notas?")) return;
      el["notas-textarea"].value = "";
      try { localStorage.removeItem(CHAVE_NOTAS); } catch (_) { /* armazenamento indisponível */ }
      atualizarContagem();
    });
  }

  app.modulos.notas = {
    inicializar,
    abrirAba,
    definirRecolhido
  };
})(window.LeitorClaude, window);
