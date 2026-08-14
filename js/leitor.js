(function registrarLeitor(app, global) {
  "use strict";

  const sintese = global.speechSynthesis;
  let execucaoAtual = 0;

  function prepararTexto(texto) {
    return texto
      .replace(/\.\s+/g, ", ")
      .replace(/\.$/, "")
      .replace(/,\s*,/g, ",")
      .trim();
  }

  function carregarVozes() {
    if (!sintese) return;
    const vozes = sintese.getVoices();
    if (!vozes.length) return;

    const preferencias = [
      (voz) => voz.name.includes("Antonio") && voz.lang === "pt-BR",
      (voz) => voz.name.includes("Daniel") && voz.lang === "pt-BR",
      (voz) => voz.lang === "pt-BR" && !voz.localService && !voz.name.includes("Francisca"),
      (voz) => voz.lang === "pt-BR" && !voz.name.includes("Francisca"),
      (voz) => voz.lang === "pt-BR",
      (voz) => voz.lang.startsWith("pt")
    ];

    app.estado.vozSelecionada = null;
    for (const preferencia of preferencias) {
      const voz = vozes.find(preferencia);
      if (voz) {
        app.estado.vozSelecionada = voz;
        break;
      }
    }

    app.elementos["voz-info"].textContent = app.estado.vozSelecionada
      ? `Voz: ${app.estado.vozSelecionada.name}`
      : "Voz padrão";
  }

  function atualizarBotoes() {
    const el = app.elementos;
    el["btn-play"].disabled = app.estado.frases.length === 0;
    el["btn-pause"].disabled = true;
    el["btn-stop"].disabled = true;
    el["btn-pause"].textContent = "⏸";
  }

  function falar(indice, identificadorExecucao) {
    const estado = app.estado;
    const el = app.elementos;

    if (identificadorExecucao !== execucaoAtual) return;

    if (indice >= estado.frases.length) {
      el.status.textContent = "Fim.";
      el["progresso-fill"].style.width = "100%";
      el["progresso-bar"].setAttribute("aria-valuenow", "100");
      atualizarBotoes();
      app.modulos.renderizador.limparDestaque();
      return;
    }

    estado.indiceAtual = indice;
    estado.emPausa = false;
    app.modulos.renderizador.destacar(indice);

    const fala = new SpeechSynthesisUtterance(estado.frases[indice]);
    fala.rate = Number(el.velocidade.value);
    fala.lang = "pt-BR";
    if (estado.vozSelecionada) fala.voice = estado.vozSelecionada;

    fala.onend = () => {
      if (!estado.emPausa && identificadorExecucao === execucaoAtual) {
        falar(indice + 1, identificadorExecucao);
      }
    };

    fala.onerror = (evento) => {
      if (evento.error !== "interrupted" && identificadorExecucao === execucaoAtual) {
        el.status.textContent = `Erro na leitura: ${evento.error}`;
      }
    };

    sintese.speak(fala);
    el["btn-play"].disabled = true;
    el["btn-pause"].disabled = false;
    el["btn-stop"].disabled = false;

    const percentual = estado.frases.length > 1
      ? (indice / (estado.frases.length - 1)) * 100
      : 0;
    el["progresso-fill"].style.width = `${percentual}%`;
    el["progresso-bar"].setAttribute("aria-valuenow", String(Math.round(percentual)));
    el.status.textContent = `Frase ${indice + 1} / ${estado.frases.length}`;
  }

  function tocarDe(indice) {
    if (!sintese || !app.estado.frases.length) return;
    sintese.cancel();
    execucaoAtual++;
    falar(indice, execucaoAtual);
  }

  function parar() {
    execucaoAtual++;
    app.estado.emPausa = false;
    if (sintese) sintese.cancel();
    atualizarBotoes();
    if (app.modulos.renderizador) app.modulos.renderizador.limparDestaque();
  }

  function alternarPausa() {
    if (!sintese) return;
    const botao = app.elementos["btn-pause"];

    if (sintese.speaking && !sintese.paused) {
      sintese.pause();
      app.estado.emPausa = true;
      botao.textContent = "▶";
    } else if (sintese.paused) {
      sintese.resume();
      app.estado.emPausa = false;
      botao.textContent = "⏸";
    }
  }

  function alternarPlayPause() {
    if (!sintese) return;
    if (sintese.speaking || sintese.paused) {
      alternarPausa();
    } else if (!app.elementos["btn-play"].disabled) {
      tocarDe(app.estado.indiceAtual);
    }
  }

  function inicializar() {
    const el = app.elementos;

    if (!sintese || typeof global.SpeechSynthesisUtterance === "undefined") {
      el["voz-info"].textContent = "Este navegador não oferece leitura em voz alta.";
      el["btn-carregar"].disabled = true;
      el["btn-direto"].disabled = true;
      return;
    }

    el.velocidade.addEventListener("input", () => {
      el["vel-display"].textContent = `${Number(el.velocidade.value).toFixed(1)}×`;
    });

    el["btn-play"].addEventListener("click", () => tocarDe(app.estado.indiceAtual));
    el["btn-pause"].addEventListener("click", alternarPausa);
    el["btn-stop"].addEventListener("click", () => {
      app.estado.indiceAtual = 0;
      parar();
      el["progresso-fill"].style.width = "0%";
      el["progresso-bar"].setAttribute("aria-valuenow", "0");
      el.status.textContent = "Parado.";
    });

    sintese.onvoiceschanged = carregarVozes;
    carregarVozes();
  }

  app.modulos.leitor = {
    inicializar,
    prepararTexto,
    tocarDe,
    parar,
    alternarPlayPause
  };
})(window.LeitorClaude, window);
