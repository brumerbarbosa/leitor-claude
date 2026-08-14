(function registrarFiltro(app) {
  "use strict";

  function deveRemover(linha) {
    if (/^(Executad[oa]|Executand[oa]|Rodand[oa])\b/i.test(linha)) return true;
    if (/^Atualizado\s*(\S+)?$/i.test(linha)) return true;
    if (/^[\w][\w-]*\.\w{1,5}$/.test(linha)) return true;
    if (/^\+\d+(\s+-\d+)?$/.test(linha) || /^-\d+$/.test(linha)) return true;
    if (/[\w][\w.-]*\.\w+\s+\+\d+\s+-\d+/.test(linha)) return true;
    if (/^Vou (explorar|analisar|escanear|verificar|checar|ler|procurar|buscar|escrever o plano|planejar agora)\b/i.test(linha) && linha.length < 180) return true;
    if (/^(Tenho tudo (o que|que) preciso|Deixa eu (escrever|planejar|analisar|ver)|Vou escrever o plano)/i.test(linha)) return true;
    if (/antes de apresentar ao usuário/i.test(linha) && linha.length < 120) return true;
    if (/^(I now |I have |I('ve| have) (a |now |just |already )|I need to |I'll |I will |I can |I should |I want to )/i.test(linha) && linha.length < 220) return true;
    if (/^Let me (read|check|confirm|look|verify|explore|analyze|investigate|find|see|inspect|run|test)\b/i.test(linha) && linha.length < 220) return true;
    if (/^(There'?s already |There are already |This is just |This will )/i.test(linha) && linha.length < 180) return true;
    if (/^Now (I'?ll|let me|I will|I need)\b/i.test(linha) && linha.length < 180) return true;
    return false;
  }

  function filtrarLinhas(texto) {
    const mantidas = [];
    const removidas = [];
    let emBlocoDeCodigo = false;

    texto.split("\n").forEach((linhaOriginal) => {
      const linha = linhaOriginal.trim();

      if (/^```/.test(linha)) {
        emBlocoDeCodigo = !emBlocoDeCodigo;
        removidas.push(linha);
        return;
      }

      if (emBlocoDeCodigo) {
        removidas.push(linha);
        return;
      }

      if (!linha) {
        mantidas.push("");
      } else if (deveRemover(linha)) {
        removidas.push(linha);
      } else {
        mantidas.push(linhaOriginal);
      }
    });

    return {
      texto: mantidas.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      removidas
    };
  }

  app.modulos.filtro = {
    deveRemover,
    filtrarLinhas
  };
})(window.LeitorClaude);
