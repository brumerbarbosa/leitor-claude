(function registrarLeitor(app, global) {
  "use strict";

  const sintese = global.speechSynthesis;
  const PALAVRAS_POR_MINUTO = 165;
  const CHAVE_VOZ = "leitor_voz_preferida";
  const CHAVE_VOLUME = "leitor_volume";
  const VELOCIDADES = [
    { valor: 0.75, rotulo: "0,75×" },
    { valor: 1, rotulo: "1,0×" },
    { valor: 1.25, rotulo: "1,25×" },
    { valor: 1.5, rotulo: "1,5×" },
    { valor: 1.8, rotulo: "1,8×" },
    { valor: 2, rotulo: "2,0×" },
    { valor: 2.5, rotulo: "2,5×" },
    { valor: 3, rotulo: "3,0×" }
  ];
  const VELOCIDADE_PADRAO = 4;
  /* No Chrome, um pause() prolongado descarta a fala e o resume() volta mudo. */
  const LIMITE_PAUSA_MS = 10000;
  let momentoPausa = 0;
  let watchdogRetomada = 0;
  let volumeAtual = 1;
  app.estado.velocidade = VELOCIDADES[VELOCIDADE_PADRAO].valor;
  let sequenciaAtual = 0;
  let aoEncerrarSequencia = null;
  let execucaoAtual = 0;
  let pesosAcumulados = [0];
  let timelineEmInteracao = false;
  let pesoReproducaoAtual = 0;
  let vozesDisponiveis = [];
  let menuContextoAberto = null;
  let gatilhoMenuAberto = null;

  /* Avisa a revisão em andamento quando a leitura principal assume o áudio. */
  function invalidarSequencia(notificar) {
    const aoEncerrar = aoEncerrarSequencia;
    aoEncerrarSequencia = null;
    sequenciaAtual++;
    if (notificar) aoEncerrar?.();
  }

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

  function chaveDaVoz(voz) {
    return voz.voiceURI || `${voz.name}|${voz.lang}`;
  }

  function renderizarMenuVozes() {
    const el = app.elementos;
    const menu = el["voz-menu"];
    menu.replaceChildren();
    const chaveAtual = app.estado.vozSelecionada ? chaveDaVoz(app.estado.vozSelecionada) : "";

    vozesDisponiveis.forEach((voz) => {
      const chave = chaveDaVoz(voz);
      menu.append(criarOpcaoMenu(chave, voz.name, chave === chaveAtual, () => {
        aplicarVoz(voz);
        fecharMenuContexto();
        (el["entrada-card"].hidden ? el["btn-voz-menu"] : el["btn-voz-editor"]).focus({ preventScroll: true });
      }, voz.lang));
    });
  }

  function renderizarMenuVelocidades() {
    const menu = app.elementos["velocidade-menu"];
    menu.replaceChildren();

    VELOCIDADES.forEach((opcao) => {
      menu.append(criarOpcaoMenu(opcao.valor, opcao.rotulo, opcao.valor === app.estado.velocidade, (valor) => {
        aplicarVelocidade(valor);
        fecharMenuContexto();
        app.elementos["btn-velocidade-menu"].focus({ preventScroll: true });
      }));
    });
  }

  function descreverVoz() {
    return app.estado.vozSelecionada
      ? `Voz selecionada: ${app.estado.vozSelecionada.name} - ${app.estado.vozSelecionada.lang}`
      : "Escolher voz da leitura";
  }

  function atualizarInterfaceVoz() {
    const el = app.elementos;
    const voz = app.estado.vozSelecionada;
    el["voz-info"].textContent = voz ? `Voz: ${voz.name} - ${voz.lang}` : "Voz padrão do navegador";
    el["voz-selecionada-label"].textContent = "Voz";
    el["btn-voz-menu"].disabled = vozesDisponiveis.length === 0;
    el["btn-voz-editor"].disabled = vozesDisponiveis.length === 0;
    el["btn-voz-menu"].title = descreverVoz();
    el["btn-voz-editor"].title = descreverVoz();
    renderizarMenuVozes();
  }

  function aplicarVoz(voz) {
    if (!voz) return;
    app.estado.vozSelecionada = voz;
    try { localStorage.setItem(CHAVE_VOZ, chaveDaVoz(voz)); } catch (_) { /* armazenamento indisponível */ }
    atualizarInterfaceVoz();

    if (app.estado.reproduzindo && !app.estado.emPausa) {
      tocarDe(app.estado.indiceAtual);
    } else if (app.estado.reproduzindo && app.estado.emPausa) {
      posicionar(app.estado.indiceAtual, false, {
        reativarAcompanhamento: false,
        forcarRolagem: false
      });
    }
  }

  function carregarVozes() {
    if (!sintese) return;
    const vozes = sintese.getVoices();
    if (!vozes.length) return;

    const vozesEmPortugues = vozes.filter((voz) => voz.lang.toLowerCase().startsWith("pt"));
    vozesDisponiveis = vozesEmPortugues.length ? vozesEmPortugues : vozes;

    let chaveSalva = "";
    try { chaveSalva = localStorage.getItem(CHAVE_VOZ) || ""; } catch (_) { /* armazenamento indisponível */ }

    /*
     * A escolha salva manda; sem ela, a primeira voz do idioma. Nomes específicos
     * não são preferidos por código: eles variam por sistema operacional.
     */
    const escolhida = vozesDisponiveis.find((voz) => chaveDaVoz(voz) === chaveSalva)
      || (app.estado.vozSelecionada
        && vozesDisponiveis.find((voz) => chaveDaVoz(voz) === chaveDaVoz(app.estado.vozSelecionada)))
      || vozesDisponiveis.find((voz) => voz.lang === "pt-BR")
      || vozesDisponiveis[0]
      || null;

    app.estado.vozSelecionada = escolhida;
    atualizarInterfaceVoz();
  }

  function configurarVoz() {
    app.elementos["btn-voz-menu"].addEventListener("click", () => {
      abrirMenuContexto(app.elementos["voz-menu"], app.elementos["btn-voz-menu"]);
    });
    app.elementos["btn-voz-editor"].addEventListener("click", () => {
      abrirMenuContexto(app.elementos["voz-menu"], app.elementos["btn-voz-editor"]);
    });
  }

  function obterVelocidade() {
    return app.estado.velocidade || 1;
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

    el["btn-play"].querySelector(".icone")?.setAttribute("data-icon", tocando ? "pause" : "play");
    el["btn-play"].setAttribute("aria-label", tocando ? "Pausar" : (estado.finalizado ? "Reproduzir novamente" : "Reproduzir"));
    el["btn-play"].title = tocando ? "Pausar (Espaço)" : "Reproduzir (Espaço)";
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
    app.modulos.renderizador.prepararKaraoke(indice);
    if (!timelineEmInteracao) atualizarProgressoDoTrecho(indice, 0);
    atualizarControles();
    el.status.textContent = `Lendo trecho ${indice + 1} de ${estado.frases.length}.`;

    const texto = estado.frases[indice];
    const fala = new SpeechSynthesisUtterance(texto);
    fala.rate = obterVelocidade();
    fala.volume = volumeAtual;
    fala.lang = "pt-BR";
    if (estado.vozSelecionada) fala.voice = estado.vozSelecionada;

    fala.onboundary = (evento) => {
      if (identificadorExecucao !== execucaoAtual || evento.charIndex === undefined) return;
      /* Nem toda voz emite boundary de palavra; sem ele o realce apenas não aparece. */
      if (evento.name === undefined || evento.name === "word") {
        app.modulos.renderizador.destacarPalavra(evento.charIndex);
      }
      if (timelineEmInteracao) return;
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
    invalidarSequencia(true);
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
    invalidarSequencia(true);
    global.clearTimeout(watchdogRetomada);
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
      global.clearTimeout(watchdogRetomada);
      sintese.pause();
      estado.emPausa = true;
      momentoPausa = Date.now();
      atualizarControles();
      app.elementos.status.textContent = `Pausado no trecho ${estado.indiceAtual + 1}.`;
      return;
    }

    if (estado.reproduzindo && estado.emPausa) {
      global.clearTimeout(watchdogRetomada);
      if (Date.now() - momentoPausa > LIMITE_PAUSA_MS) {
        tocarDe(estado.indiceAtual);
        return;
      }
      sintese.resume();
      estado.emPausa = false;
      atualizarControles();
      app.elementos.status.textContent = `Lendo trecho ${estado.indiceAtual + 1} de ${estado.frases.length}.`;
      watchdogRetomada = global.setTimeout(() => {
        if (estado.reproduzindo && !estado.emPausa && !sintese.speaking) {
          tocarDe(estado.indiceAtual);
        }
      }, 600);
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

  function aplicarVelocidade(valor) {
    const el = app.elementos;
    const opcao = VELOCIDADES.find((item) => item.valor === Number(valor)) || VELOCIDADES[VELOCIDADE_PADRAO];
    app.estado.velocidade = opcao.valor;

    el["vel-display"].textContent = opcao.rotulo;
    el["ajuste-velocidade-valor"].textContent = opcao.rotulo;
    el["btn-velocidade-menu"].setAttribute("aria-label", `Velocidade da leitura: ${opcao.rotulo.replace("×", " vezes")}`);
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
      el.status.textContent = `Velocidade ${opcao.rotulo}; trecho atual reiniciado.`;
    } else if (estavaPausado) {
      posicionar(app.estado.indiceAtual, false, {
        reativarAcompanhamento: false,
        forcarRolagem: false
      });
      el.status.textContent = `Velocidade ${opcao.rotulo}; pronta para retomar do mesmo trecho.`;
    }
  }

  function configurarVelocidade() {
    aplicarVelocidade(app.estado.velocidade);
    app.elementos["btn-velocidade-menu"].addEventListener("click", () => {
      abrirMenuContexto(app.elementos["velocidade-menu"], app.elementos["btn-velocidade-menu"], true);
    });
  }

  function posicionarPopupVolume() {
    /* Flutua acima do player, centralizado, como o botão Sincronizar. */
    const popup = app.elementos["volume-popup"];
    const margem = 12;
    const caixaPlayer = app.elementos["player-fixo"].getBoundingClientRect();
    const esquerda = Math.max(margem, Math.min(
      global.innerWidth - popup.offsetWidth - margem,
      (global.innerWidth - popup.offsetWidth) / 2
    ));
    popup.style.left = `${esquerda}px`;
    popup.style.top = `${Math.max(margem, caixaPlayer.top - popup.offsetHeight - 12)}px`;
  }

  function configurarVolume() {
    const el = app.elementos;
    const slider = el["volume-slider"];

    const salvo = Number(app.modulos.seguranca.lerJsonLocal(CHAVE_VOLUME, 1));
    volumeAtual = Number.isFinite(salvo) ? Math.max(0, Math.min(salvo, 1)) : 1;

    function atualizarInterfaceVolume() {
      const percentual = Math.round(volumeAtual * 100);
      slider.value = String(percentual);
      slider.style.setProperty("--progresso", `${percentual}%`);
      slider.setAttribute("aria-valuetext", `${percentual}%`);
      el["volume-valor"].textContent = `${percentual}%`;
      el["btn-volume"].title = `Volume da leitura: ${percentual}%`;
      el["btn-volume"].setAttribute("aria-label", `Volume da leitura: ${percentual}%`);
    }
    atualizarInterfaceVolume();

    el["btn-volume"].addEventListener("click", () => {
      abrirMenuContexto(el["volume-popup"], el["btn-volume"], true);
      if (!el["volume-popup"].hidden) {
        posicionarPopupVolume();
        slider.focus({ preventScroll: true });
      }
    });

    slider.addEventListener("input", () => {
      volumeAtual = Math.max(0, Math.min(Number(slider.value) / 100, 1));
      atualizarInterfaceVolume();
      try { localStorage.setItem(CHAVE_VOLUME, JSON.stringify(volumeAtual)); } catch (_) { /* armazenamento indisponível */ }
    });

    slider.addEventListener("change", () => {
      /* O volume só entra na próxima fala; reiniciar o trecho aplica na hora. */
      if (app.estado.reproduzindo && !app.estado.emPausa) tocarDe(app.estado.indiceAtual);
    });
  }

  function ajustarVelocidade(passo) {
    const atual = VELOCIDADES.findIndex((opcao) => opcao.valor === app.estado.velocidade);
    const alvo = Math.max(0, Math.min(atual + passo, VELOCIDADES.length - 1));
    if (alvo === atual) return;
    aplicarVelocidade(VELOCIDADES[alvo].valor);
  }

  /*
   * Fala uma lista de textos avulsos (a revisão) sem tocar no documento carregado:
   * o texto, a posição e os trechos da leitura principal continuam como estavam.
   * Devolve a função que encerra a sequência.
   */
  function falarSequencia(itens, opcoes = {}) {
    const { aoItem, aoTerminar, aoEncerrar } = opcoes;
    if (!sintese || !Array.isArray(itens) || !itens.length) return () => {};

    parar();
    sequenciaAtual++;
    aoEncerrarSequencia = aoEncerrar || null;
    const identificador = sequenciaAtual;
    let indice = 0;

    const seguir = () => {
      if (identificador !== sequenciaAtual) return;
      if (indice >= itens.length) {
        aoEncerrarSequencia = null;
        aoTerminar?.();
        return;
      }

      const item = itens[indice];
      aoItem?.(item, indice, itens.length);

      const fala = new SpeechSynthesisUtterance(item.texto);
      fala.rate = obterVelocidade();
      fala.volume = volumeAtual;
      fala.lang = "pt-BR";
      if (app.estado.vozSelecionada) fala.voice = app.estado.vozSelecionada;
      fala.onend = () => {
        if (identificador !== sequenciaAtual) return;
        indice++;
        seguir();
      };
      fala.onerror = () => {
        if (identificador !== sequenciaAtual) return;
        indice++;
        seguir();
      };
      sintese.speak(fala);
    };

    seguir();

    return function encerrar() {
      if (identificador !== sequenciaAtual) return;
      invalidarSequencia(false);
      sintese.cancel();
    };
  }

  function inicializar() {
    const el = app.elementos;

    if (!sintese || typeof global.SpeechSynthesisUtterance === "undefined") {
      el["voz-info"].textContent = "Este navegador não oferece leitura em voz alta.";
      el["btn-voz-menu"].disabled = true;
      el["btn-voz-editor"].disabled = true;
      el["voz-selecionada-label"].textContent = "Leitura indisponível";
      el["btn-carregar"].disabled = true;
      el["btn-direto"].disabled = true;
      el["btn-volume"].disabled = true;
      return;
    }

    el["btn-play"].addEventListener("click", alternarPlayPause);
    el["btn-stop"].addEventListener("click", pararEVoltarAoInicio);
    el["btn-retroceder"].addEventListener("click", () => pular(-1));
    el["btn-avancar"].addEventListener("click", () => pular(1));
    configurarTimeline();
    configurarVelocidade();
    configurarVoz();
    configurarVolume();

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
    /* A síntese vive fora da página; sem isso o Chrome segue falando após fechar ou recarregar. */
    global.addEventListener("pagehide", () => sintese.cancel());

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
    pular,
    ajustarVelocidade,
    falarSequencia,
    documentoAtualizado,
    abrirMenuVelocidade() {
      if (app.elementos["player-fixo"].hidden) return;
      abrirMenuContexto(app.elementos["velocidade-menu"], app.elementos["btn-velocidade-menu"], true);
    }
  };
})(window.LeitorClaude, window);
