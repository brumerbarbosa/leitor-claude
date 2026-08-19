(function registrarFiltro(app) {
  "use strict";

  const CHAVE_CONFIGURACAO = "leitor_filtro";

  /*
   * Cada categoria agrupa regras da mesma natureza para poder ser desligada
   * sozinha em Configurações. A ordem aqui é a ordem exibida na tela.
   */
  const CATEGORIAS = [
    {
      id: "planejamento",
      rotulo: "Frases de planejamento",
      exemplo: "“Vou analisar o módulo”, “Deixa eu verificar”",
      combina: (linha) =>
        (/^Vou (explorar|analisar|escanear|verificar|checar|ler|procurar|buscar|escrever o plano|planejar agora)\b/i.test(linha) && linha.length < 180)
        || /^(Tenho tudo (o que|que) preciso|Deixa eu (escrever|planejar|analisar|ver)|Vou escrever o plano)/i.test(linha)
        || (/antes de apresentar ao usuário/i.test(linha) && linha.length < 120)
    },
    {
      id: "planejamentoIngles",
      rotulo: "Frases de planejamento em inglês",
      exemplo: "“Let me check”, “I'll now update”",
      combina: (linha) =>
        (/^(I now |I have |I('ve| have) (a |now |just |already )|I need to |I'll |I will |I can |I should |I want to )/i.test(linha) && linha.length < 220)
        || (/^Let me (read|check|confirm|look|verify|explore|analyze|investigate|find|see|inspect|run|test)\b/i.test(linha) && linha.length < 220)
        || (/^(There'?s already |There are already |This is just |This will )/i.test(linha) && linha.length < 180)
        || (/^Now (I'?ll|let me|I will|I need)\b/i.test(linha) && linha.length < 180)
    },
    {
      id: "status",
      rotulo: "Linhas de status",
      exemplo: "“Executando testes”, “Atualizado”",
      combina: (linha) =>
        /^(Executad[oa]|Executand[oa]|Rodand[oa])\b/i.test(linha)
        || /^Atualizado\s*(\S+)?$/i.test(linha)
    },
    {
      id: "arquivos",
      rotulo: "Nomes de arquivo soltos",
      exemplo: "uma linha contendo apenas “auth.js”",
      combina: (linha) => /^[\w][\w-]*\.\w{1,5}$/.test(linha)
    },
    {
      id: "diffs",
      rotulo: "Contadores de alterações",
      exemplo: "“+42 -17”",
      combina: (linha) =>
        /^\+\d+(\s+-\d+)?$/.test(linha)
        || /^-\d+$/.test(linha)
        || /[\w][\w.-]*\.\w+\s+\+\d+\s+-\d+/.test(linha)
    }
  ];

  const PADRAO = Object.freeze(
    CATEGORIAS.reduce((acumulado, categoria) => {
      acumulado[categoria.id] = true;
      return acumulado;
    }, { termos: [] })
  );

  let configuracao = normalizar(null);

  function normalizar(bruta) {
    const origem = bruta && typeof bruta === "object" ? bruta : {};
    const resultado = { termos: [] };

    CATEGORIAS.forEach((categoria) => {
      resultado[categoria.id] = origem[categoria.id] !== false;
    });

    if (Array.isArray(origem.termos)) {
      resultado.termos = origem.termos
        .filter((termo) => typeof termo === "string")
        .map((termo) => termo.trim())
        .filter(Boolean);
    }

    return resultado;
  }

  function obterConfiguracao() {
    return { ...configuracao, termos: [...configuracao.termos] };
  }

  function definirConfiguracao(nova) {
    configuracao = normalizar(nova);
    try {
      localStorage.setItem(CHAVE_CONFIGURACAO, JSON.stringify(configuracao));
    } catch (_) {
      /* Sem persistência a configuração vale só para esta sessão. */
    }
    return obterConfiguracao();
  }

  function carregarConfiguracao() {
    configuracao = normalizar(app.modulos.seguranca.lerJsonLocal(CHAVE_CONFIGURACAO, null));
    return obterConfiguracao();
  }

  function combinaComTermo(linha, termo) {
    return linha.toLowerCase().includes(termo.toLowerCase());
  }

  function deveRemover(linha, config = configuracao) {
    const ativa = normalizar(config);

    if (ativa.termos.some((termo) => combinaComTermo(linha, termo))) return true;

    return CATEGORIAS.some((categoria) => ativa[categoria.id] && categoria.combina(linha));
  }

  function filtrarLinhas(texto, config = configuracao) {
    const mantidas = [];
    const removidas = [];
    let emBlocoDeCodigo = false;

    texto.split("\n").forEach((linhaOriginal) => {
      const linha = linhaOriginal.trim();

      /* Dentro de um bloco de código nada é filtrado: recuo e conteúdo seguem intactos. */
      if (/^```/.test(linha)) {
        emBlocoDeCodigo = !emBlocoDeCodigo;
        mantidas.push(linhaOriginal);
        return;
      }

      if (emBlocoDeCodigo) {
        mantidas.push(linhaOriginal);
        return;
      }

      if (!linha) {
        mantidas.push("");
      } else if (deveRemover(linha, config)) {
        removidas.push(linha);
      } else {
        mantidas.push(linhaOriginal);
      }
    });

    /* Linhas em branco repetidas são unidas apenas fora dos blocos de código. */
    const finais = [];
    let dentroDeCodigo = false;
    mantidas.forEach((linha) => {
      if (/^```/.test(linha.trim())) dentroDeCodigo = !dentroDeCodigo;
      if (!dentroDeCodigo && linha === "" && finais[finais.length - 1] === "") return;
      finais.push(linha);
    });

    return {
      texto: finais.join("\n").trim(),
      removidas
    };
  }

  app.modulos.filtro = {
    CATEGORIAS,
    PADRAO,
    deveRemover,
    filtrarLinhas,
    obterConfiguracao,
    definirConfiguracao,
    carregarConfiguracao
  };
})(window.LeitorClaude);
