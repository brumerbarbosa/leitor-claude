(function registrarLeitor(app, global) {
  "use strict";

  const sintese = global.speechSynthesis;
  const PALAVRAS_POR_MINUTO = 165;
  const CHAVE_VOZ = "leitor_voz_preferida";
  let execucaoAtual = 0;
  let pesosAcumulados = [0];
  let timelineEmInteracao = false;
  let pesoReproducaoAtual = 0;
  let vozesDisponiveis = [];
  let menuContextoAberto = null;
  let gatilhoMenuAberto = null;

  function prepararTexto(texto) {
    return texto
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  function contarPalavras(texto) {
    const palavras = texto.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
    return Math.max(1, palavras?.length || 0);
  }

  function fecharMenuContexto() {
    if (!menuContextoAberto) return;
    menuContextoAberto.hidden = true;
    gatilhoMenuAberto?.setAttribute("aria-expanded", "false");
    menuContextoAberto = null;
    gatilhoMenuAberto = null;
  }

  function posicionarMenuContexto(menu, gatilho, abrirAcima = false) {
    const margem = 12;
    const caixa = gatilho.getBoundingClientRect();
    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.maxWidth = `${Math.max(220, global.innerWidth - margem * 2)}px`;

    const largura = menu.offsetWidth;
    const altura = menu.offsetHeight;
    const esquerda = Math.min(global.innerWidth - largura - margem, Math.max(margem, caixa.right - largura));
    const espacoAbaixo = global.innerHeight - caixa.bottom - margem;
    const usarAcima = abrirAcima || (espacoAbaixo < altura && caixa.top > altura);
    const topo = usarAcima
      ? Math.max(margem, caixa.top - altura - 8)
      : Math.min(global.innerHeight - altura - margem, caixa.bottom + 8);

    menu.style.left = `${esquerda}px`;
    menu.style.top = `${Math.max(margem, topo)}px`;
    menu.style.visibility = "visible";
  }

  function abrirMenuContexto(menu, gatilho, abrirAcima = false) {
    const jaAberto = menuContextoAberto === menu && !menu.hidden;
    fecharMenuContexto();
    if (jaAberto) return;
    menuContextoAberto = menu;
    gatilhoMenuAberto = gatilho;
    gatilho.setAttribute("aria-expanded", "true");
    posicionarMenuContexto(menu, gatilho, abrirAcima);
    menu.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
  }

  function criarOpcaoMenu(valor, rotulo, selecionada, aoEscolher, detalhe = "") {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "menu-contexto-opcao";
    botao.setAttribute("role", "option");
    botao.setAttribute("aria-selected", String(selecionada));

    const indicador = document.createElement("span");
    indicador.className = "menu-contexto-check";
    indicador.textContent = selecionada ? "✓" : "";

    const texto = document.createElement("span");
    texto.className = "menu-contexto-texto";
    const principal = document.createElement("strong");
    principal.textContent = rotulo;
    texto.append(principal);
    if (detalhe) {
      const secundario = document.createElement("small");
      secundario.textContent = detalhe;
      texto.append(secundario);
    }

    botao.append(indicador, texto);
    botao.addEventListener("click", () => aoEscolher(valor));
    return botao;
  }

  function renderizarMenuVozes() {
    const el = app.elementos;
    const menu = el["voz-menu"];
    menu.replaceChildren();
    const chaveAtual = el["voz-select-topbar"].value;
    vozesDisponiveis.forEach((voz) => {
      const chave = voz.voiceURI || `${voz.name}|${voz.lang}`;
      menu.append(criarOpcaoMenu(chave, voz.name, chave === chaveAtual, (valor) => {
        el["voz-select-topbar"].value = valor;
        el["voz-select-topbar"].dispatchEvent(new Event("change", { bubbles: true }));
        fecharMenuContexto();
        el["btn-voz-menu"].focus({ preventScroll: true });
      }, voz.lang));
    });
  }

  function renderizarMenuVelocidades() {
    const el = app.elementos;
    const menu = el["velocidade-menu"];
    menu.replaceChildren();
    Array.from(el.velocidade.options).forEach((opcao) => {
      menu.append(criarOpcaoMenu(opcao.value, opcao.textContent, opcao.value === el.velocidade.value, (valor) => {
        el.velocidade.value = valor;
        el.velocidade.dispatchEvent(new Event("change", { bubbles: true }));
        fecharMenuContexto();
        el["btn-velocidade-menu"].focus({ preventScroll: true });
      }));
    });
  }

  function carregarVozes() {
    if (!sintese) return;
    const vozes = sintese.getVoices();
    if (!vozes.length) return;

    const vozesEmPortugues = vozes.filter((voz) => voz.lang.toLowerCase().startsWith("pt"));
    vozesDisponiveis = vozesEmPortugues.length ? vozesEmPortugues : vozes;

    const preferencias = [
      (voz) => voz.name.includes("Antonio") && voz.lang === "pt-BR",
      (voz) => voz.name.includes("Daniel") && voz.lang === "pt-BR",
      (voz) => voz.lang === "pt-BR" && !voz.localService && !voz.name.includes("Francisca"),
      (voz) => voz.lang === "pt-BR" && !voz.name.includes("Francisca"),
      (voz) => voz.lang === "pt-BR",
      (voz) => voz.lang.startsWith("pt")
    ];

    let chaveSalva = "";
    try { chaveSalva = localStorage.getItem(CHAVE_VOZ) || ""; } catch (_) { /* armazenamento indisponível */ }

    const chaveVoz = (voz) => voz.voiceURI || `${voz.name}|${voz.lang}`;
    let vozSelecionada = vozesDisponiveis.find((voz) => chaveVoz(voz) === chaveSalva);
    if (!vozSelecionada && app.estado.vozSelecionada) {
      const chaveAtual = chaveVoz(app.estado.vozSelecionada);
      vozSelecionada = vozesDisponiveis.find((voz) => chaveVoz(voz) === chaveAtual);
    }
    if (!vozSelecionada) {
      for (const preferencia of preferencias) {
        const voz = vozesDisponiveis.find(preferencia);
        if (voz) {
          vozSelecionada = voz;
          break;
        }
      }
    }
    app.estado.vozSelecionada = vozSelecionada || vozesDisponiveis[0] || null;

    const rotuloVoz = app.estado.vozSelecionada
      ? `Voz: ${app.estado.vozSelecionada.name} - ${app.estado.vozSelecionada.lang}`
      : "Voz padrão do navegador";
    app.elementos["voz-info"].textContent = rotuloVoz;

    const seletor = app.elementos["voz-select-topbar"];
    seletor.innerHTML = "";
    vozesDisponiveis.forEach((voz) => {
      const opcao = document.createElement("option");
      opcao.value = chaveVoz(voz);
      opcao.textContent = `${voz.name} — ${voz.lang}`;
      seletor.append(opcao);
    });
    seletor.value = app.estado.vozSelecionada ? chaveVoz(app.estado.vozSelecionada) : "";
    seletor.disabled = vozesDisponiveis.length === 0;
    app.elementos["btn-voz-menu"].disabled = vozesDisponiveis.length === 0;
    app.elementos["voz-selecionada-label"].textContent = app.estado.vozSelecionada
      ? `${app.estado.vozSelecionada.name} - ${app.estado.vozSelecionada.lang}`
      : "Voz do navegador";
    renderizarMenuVozes();
  }

  function configurarVoz() {
    const seletor = app.elementos["voz-select-topbar"];
    app.elementos["btn-voz-menu"].addEventListener("click", () => {
      abrirMenuContexto(app.elementos["voz-menu"], app.elementos["btn-voz-menu"]);
    });
    seletor.addEventListener("change", () => {
      const voz = vozesDisponiveis.find((item) => (item.voiceURI || `${item.name}|${item.lang}`) === seletor.value);
      if (!voz) return;

      app.estado.vozSelecionada = voz;
      app.elementos["voz-info"].textContent = `Voz: ${voz.name} - ${voz.lang}`;
      app.elementos["voz-selecionada-label"].textContent = `${voz.name} - ${voz.lang}`;
      try { localStorage.setItem(CHAVE_VOZ, seletor.value); } catch (_) { /* armazenamento indisponível */ }
      renderizarMenuVozes();

      if (app.estado.reproduzindo && !app.estado.emPausa) {
        tocarDe(app.estado.indiceAtual);
      } else if (app.estado.reproduzindo && app.estado.emPausa) {
        posicionar(app.estado.indiceAtual, false, {
          reativarAcompanhamento: false,
          forcarRolagem: false
        });
      }
    });
  }

  function obterVelocidade() {
    return Number(app.elementos.velocidade.value) || 1;
  }

  function formatarTempo(segundos) {
    const total = Math.max(0, Math.round(segundos));
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const segundosRestantes = total % 60;

    if (horas) {
      return `${horas}:${String(minutos).padStart(2, "0")}:${String(segundosRestantes).padStart(2, "0")}`;
    }
    return `${String(minutos).padStart(2, "0")}:${String(segundosRestantes).padStart(2, "0")}`;
  }

  function pesoParaSegundos(peso) {
    return (peso / (PALAVRAS_POR_MINUTO * obterVelocidade())) * 60;
  }

  function obterIndicePorPeso(peso) {
    const limite = Math.max(0, Math.min(Number(peso) || 0, app.estado.pesoTotal));
    for (let indice = 0; indice < app.estado.frases.length; indice++) {
      if (limite < pesosAcumulados[indice + 1]) return indice;
    }
    return Math.max(0, app.estado.frases.length - 1);
  }

  function atualizarControles() {
    const el = app.elementos;
    const estado = app.estado;
    const disponivel = estado.frases.length > 0;
    const tocando = estado.reproduzindo && !estado.emPausa;

    el["btn-play"].disabled = !disponivel;
    el["btn-stop"].disabled = !disponivel;
    el["btn-retroceder"].disabled = !disponivel || estado.indiceAtual <= 0;
    el["btn-avancar"].disabled = !disponivel || estado.indiceAtual >= estado.frases.length - 1;

    el["btn-play"].querySelector("use")?.setAttribute("href", tocando ? "#icon-pause" : "#icon-play");
    el["btn-play"].setAttribute("aria-label", tocando ? "Pausar" : (estado.finalizado ? "Reproduzir novamente" : "Reproduzir"));
    el["btn-play"].title = tocando ? "Pausar" : "Reproduzir";
  }

  function atualizarProgressoPorPeso(peso, previsualizacao = false) {
    const el = app.elementos;
    const estado = app.estado;
    const total = Math.max(1, estado.pesoTotal);
    const valor = Math.max(0, Math.min(Number(peso) || 0, total));
    const percentual = (valor / total) * 100;
    const indiceExibido = estado.frases.length ? obterIndicePorPeso(valor) : 0;
    if (!previsualizacao) pesoReproducaoAtual = valor;

    el.timeline.value = String(Math.round(valor));
    el.timeline.style.setProperty("--progresso", `${percentual}%`);
    el["tempo-atual"].textContent = formatarTempo(pesoParaSegundos(valor));
    el["tempo-total"].textContent = formatarTempo(pesoParaSegundos(estado.pesoTotal));

    if (estado.frases.length) {
      el.timeline.setAttribute(
        "aria-valuetext",
        `Trecho ${indiceExibido + 1} de ${estado.frases.length}, aproximadamente ${formatarTempo(pesoParaSegundos(valor))}`
      );
      const rotuloTrecho = previsualizacao
        ? `Ir para o trecho ${indiceExibido + 1} de ${estado.frases.length}`
        : `Trecho ${estado.indiceAtual + 1} de ${estado.frases.length}`;
      if (el["player-trecho"].textContent !== rotuloTrecho) {
        el["player-trecho"].textContent = rotuloTrecho;
      }
      el["player-trecho"].dataset.resumo = `${indiceExibido + 1} de ${estado.frases.length}`;
    }
  }

  function atualizarProgressoDoTrecho(indice, proporcao = 0) {
    const inicio = pesosAcumulados[indice] || 0;
    const pesoTrecho = app.estado.pesosFrases[indice] || 1;
    atualizarProgressoPorPeso(inicio + pesoTrecho * Math.max(0, Math.min(proporcao, 1)));
  }

  function finalizarLeitura(forcarInterface = false) {
    const estado = app.estado;
    estado.reproduzindo = false;
    estado.emPausa = false;
    estado.finalizado = true;
    estado.indiceAtual = Math.max(0, estado.frases.length - 1);
    if (!timelineEmInteracao || forcarInterface) atualizarProgressoPorPeso(estado.pesoTotal);
    atualizarControles();
    app.modulos.renderizador.limparDestaque();
    app.elementos.status.textContent = "Fim da leitura.";
    if (!timelineEmInteracao || forcarInterface) {
      app.elementos["player-trecho"].textContent = `${estado.frases.length} trechos concluídos`;
      app.elementos["player-trecho"].dataset.resumo = `${estado.frases.length} de ${estado.frases.length}`;
    }
  }

  function falar(indice, identificadorExecucao) {
    const estado = app.estado;
    const el = app.elementos;

    if (identificadorExecucao !== execucaoAtual || !estado.reproduzindo) return;
    if (indice >= estado.frases.length) {
      finalizarLeitura();
      return;
    }

    estado.indiceAtual = indice;
    estado.emPausa = false;
    estado.finalizado = false;
    app.modulos.renderizador.destacar(indice);
    if (!timelineEmInteracao) atualizarProgressoDoTrecho(indice, 0);
    atualizarControles();
    el.status.textContent = `Lendo trecho ${indice + 1} de ${estado.frases.length}.`;

    const texto = estado.frases[indice];
    const fala = new SpeechSynthesisUtterance(texto);
    fala.rate = obterVelocidade();
    fala.lang = "pt-BR";
    if (estado.vozSelecionada) fala.voice = estado.vozSelecionada;

    fala.onboundary = (evento) => {
      if (identificadorExecucao !== execucaoAtual || timelineEmInteracao || evento.charIndex === undefined) return;
      const proporcao = texto.length ? evento.charIndex / texto.length : 0;
      atualizarProgressoDoTrecho(indice, proporcao);
    };

    fala.onend = () => {
      if (identificadorExecucao === execucaoAtual && estado.reproduzindo && !estado.emPausa) {
        falar(indice + 1, identificadorExecucao);
      }
    };

    fala.onerror = (evento) => {
      if (identificadorExecucao !== execucaoAtual) return;
      estado.reproduzindo = false;
      estado.emPausa = false;
      atualizarControles();
      el.status.textContent = `Erro na leitura: ${evento.error}`;
    };

    sintese.speak(fala);
  }

  function tocarDe(indice) {
    const estado = app.estado;
    if (!sintese || !estado.frases.length) return;

    const alvo = Math.max(0, Math.min(Number(indice) || 0, estado.frases.length - 1));
    execucaoAtual++;
    const identificadorExecucao = execucaoAtual;
    sintese.cancel();

    estado.indiceAtual = alvo;
    estado.reproduzindo = true;
    estado.emPausa = false;
    estado.finalizado = false;
    atualizarControles();

    falar(alvo, identificadorExecucao);
  }

  function parar() {
    execucaoAtual++;
    app.estado.reproduzindo = false;
    app.estado.emPausa = false;
    app.estado.finalizado = false;
    if (sintese) sintese.cancel();
    atualizarControles();
    if (app.modulos.renderizador) app.modulos.renderizador.limparDestaque();
  }

  function pararEVoltarAoInicio() {
    parar();
    app.estado.indiceAtual = 0;
    atualizarProgressoPorPeso(0);
    app.elementos.status.textContent = "Leitura parada no início.";
  }

  function alternarPlayPause() {
    const estado = app.estado;
    if (!sintese || !estado.frases.length) return;

    if (estado.reproduzindo && !estado.emPausa) {
      sintese.pause();
      estado.emPausa = true;
      atualizarControles();
      app.elementos.status.textContent = `Pausado no trecho ${estado.indiceAtual + 1}.`;
      return;
    }

    if (estado.reproduzindo && estado.emPausa) {
      sintese.resume();
      estado.emPausa = false;
      atualizarControles();
      app.elementos.status.textContent = `Lendo trecho ${estado.indiceAtual + 1} de ${estado.frases.length}.`;
      return;
    }

    tocarDe(estado.finalizado ? 0 : estado.indiceAtual);
  }

  function posicionar(indice, continuarReproducao, opcoes = {}) {
    const estado = app.estado;
    if (!estado.frases.length) return;

    const {
      reativarAcompanhamento = true,
      forcarRolagem = true
    } = opcoes;

    const alvo = Math.max(0, Math.min(Number(indice) || 0, estado.frases.length - 1));
    parar();
    estado.indiceAtual = alvo;
    if (reativarAcompanhamento) app.modulos.renderizador.definirAcompanhamento(true, false);
    app.modulos.renderizador.destacar(alvo, forcarRolagem);
    atualizarProgressoDoTrecho(alvo, 0);
    atualizarControles();
    app.elementos.status.textContent = `Posicionado no trecho ${alvo + 1} de ${estado.frases.length}.`;

    if (continuarReproducao) tocarDe(alvo);
  }

  function pular(deslocamento) {
    const continuar = app.estado.reproduzindo && !app.estado.emPausa;
    posicionar(app.estado.indiceAtual + deslocamento, continuar);
  }

  function documentoAtualizado() {
    const estado = app.estado;
    estado.pesosFrases = estado.frases.map(contarPalavras);
    pesosAcumulados = [0];
    estado.pesosFrases.forEach((peso) => {
      pesosAcumulados.push(pesosAcumulados[pesosAcumulados.length - 1] + peso);
    });
    estado.pesoTotal = pesosAcumulados[pesosAcumulados.length - 1] || 0;
    estado.indiceAtual = 0;
    estado.reproduzindo = false;
    estado.emPausa = false;
    estado.finalizado = false;
    pesoReproducaoAtual = 0;

    const disponivel = estado.frases.length > 0;
    app.elementos["player-fixo"].hidden = !disponivel;
    document.body.classList.toggle("com-player", disponivel);
    app.elementos.timeline.disabled = !disponivel;
    app.elementos.timeline.max = String(Math.max(1, estado.pesoTotal));
    atualizarProgressoPorPeso(0);
    atualizarControles();
  }

  function configurarTimeline() {
    const timeline = app.elementos.timeline;

    function concluirPeloControle() {
      execucaoAtual++;
      if (sintese) sintese.cancel();
      finalizarLeitura(true);
    }

    function restaurarProgressoAtual() {
      if (app.estado.finalizado) {
        atualizarProgressoPorPeso(app.estado.pesoTotal);
        app.elementos["player-trecho"].textContent = `${app.estado.frases.length} trechos concluídos`;
        app.elementos["player-trecho"].dataset.resumo = `${app.estado.frases.length} de ${app.estado.frases.length}`;
      } else {
        atualizarProgressoPorPeso(pesoReproducaoAtual);
      }
    }

    timeline.addEventListener("pointerdown", () => {
      timelineEmInteracao = true;
    });

    timeline.addEventListener("keydown", (evento) => {
      const saltos = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1,
        PageDown: -5,
        PageUp: 5
      };
      if (!(evento.key in saltos) && evento.key !== "Home" && evento.key !== "End") return;

      evento.preventDefault();
      timelineEmInteracao = false;
      const continuar = app.estado.reproduzindo && !app.estado.emPausa;
      if (evento.key === "End") {
        concluirPeloControle();
      } else if (evento.key === "Home") {
        posicionar(0, continuar);
      } else {
        posicionar(app.estado.indiceAtual + saltos[evento.key], continuar);
      }
    });

    timeline.addEventListener("input", () => {
      timelineEmInteracao = true;
      atualizarProgressoPorPeso(Number(timeline.value), true);
    });

    timeline.addEventListener("change", () => {
      const valor = Number(timeline.value);
      const continuar = app.estado.reproduzindo && !app.estado.emPausa;
      timelineEmInteracao = false;

      if (valor >= app.estado.pesoTotal) {
        concluirPeloControle();
        return;
      }
      posicionar(obterIndicePorPeso(valor), continuar);
    });

    timeline.addEventListener("pointercancel", () => {
      if (!timelineEmInteracao) return;
      timelineEmInteracao = false;
      restaurarProgressoAtual();
    });

    timeline.addEventListener("pointerup", () => {
      global.setTimeout(() => {
        if (!timelineEmInteracao) return;
        timelineEmInteracao = false;
        restaurarProgressoAtual();
      }, 0);
    });

    timeline.addEventListener("blur", () => {
      if (!timelineEmInteracao) return;
      timelineEmInteracao = false;
      restaurarProgressoAtual();
    });
  }

  function configurarVelocidade() {
    const el = app.elementos;
    renderizarMenuVelocidades();
    el["btn-velocidade-menu"].addEventListener("click", () => {
      abrirMenuContexto(el["velocidade-menu"], el["btn-velocidade-menu"], true);
    });
    el.velocidade.addEventListener("change", () => {
      const valor = obterVelocidade();
      const rotulo = `${String(valor).replace(".", ",")}×`;
      el["vel-display"].textContent = rotulo;
      el["ajuste-velocidade-valor"].textContent = rotulo;
      el["btn-velocidade-menu"].setAttribute("aria-label", `Velocidade da leitura: ${rotulo.replace("×", " vezes")}`);
      renderizarMenuVelocidades();
      const estavaTocando = app.estado.reproduzindo && !app.estado.emPausa;
      const estavaPausado = app.estado.reproduzindo && app.estado.emPausa;

      if (app.estado.finalizado) {
        atualizarProgressoPorPeso(app.estado.pesoTotal);
        el["player-trecho"].textContent = `${app.estado.frases.length} trechos concluídos`;
        el["player-trecho"].dataset.resumo = `${app.estado.frases.length} de ${app.estado.frases.length}`;
        return;
      }

      atualizarProgressoDoTrecho(app.estado.indiceAtual, 0);
      if (estavaTocando) {
        tocarDe(app.estado.indiceAtual);
        el.status.textContent = `Velocidade ${rotulo}; trecho atual reiniciado.`;
      } else if (estavaPausado) {
        posicionar(app.estado.indiceAtual, false, {
          reativarAcompanhamento: false,
          forcarRolagem: false
        });
        el.status.textContent = `Velocidade ${rotulo}; pronta para retomar do mesmo trecho.`;
      }
    });
  }

  function inicializar() {
    const el = app.elementos;

    if (!sintese || typeof global.SpeechSynthesisUtterance === "undefined") {
      el["voz-info"].textContent = "Este navegador não oferece leitura em voz alta.";
      el["voz-select-topbar"].innerHTML = "<option>Leitura indisponível</option>";
      el["voz-select-topbar"].disabled = true;
      el["btn-voz-menu"].disabled = true;
      el["voz-selecionada-label"].textContent = "Leitura indisponível";
      el["btn-carregar"].disabled = true;
      el["btn-direto"].disabled = true;
      return;
    }

    el["btn-play"].addEventListener("click", alternarPlayPause);
    el["btn-stop"].addEventListener("click", pararEVoltarAoInicio);
    el["btn-retroceder"].addEventListener("click", () => pular(-1));
    el["btn-avancar"].addEventListener("click", () => pular(1));
    configurarTimeline();
    configurarVelocidade();
    configurarVoz();

    document.addEventListener("pointerdown", (evento) => {
      if (!menuContextoAberto) return;
      if (menuContextoAberto.contains(evento.target) || gatilhoMenuAberto?.contains(evento.target)) return;
      fecharMenuContexto();
    });
    document.addEventListener("keydown", (evento) => {
      if (evento.key !== "Escape" || !menuContextoAberto) return;
      const gatilho = gatilhoMenuAberto;
      fecharMenuContexto();
      gatilho?.focus({ preventScroll: true });
    });
    global.addEventListener("resize", fecharMenuContexto);

    sintese.onvoiceschanged = carregarVozes;
    carregarVozes();
    atualizarControles();
  }

  app.modulos.leitor = {
    inicializar,
    prepararTexto,
    tocarDe,
    parar,
    alternarPlayPause,
    posicionar,
    documentoAtualizado,
    abrirMenuVelocidade() {
      if (app.elementos["player-fixo"].hidden) return;
      abrirMenuContexto(app.elementos["velocidade-menu"], app.elementos["btn-velocidade-menu"], true);
    }
  };
})(window.LeitorClaude, window);
