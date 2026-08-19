/*
 * Service worker do Leitor Claude.
 *
 * A aplicação é inteiramente estática, então a estratégia é simples: tudo o que
 * forma o app é gravado no cache na instalação e servido de lá primeiro. Isso dá
 * funcionamento offline completo. Ao publicar uma versão nova, basta mudar VERSAO
 * para que o cache antigo seja descartado.
 */

const VERSAO = "leitor-claude-v4";

const ARQUIVOS = [
  "./",
  "index.html",
  "manifest.json",
  "css/styles.css",
  "js/ajustes.js",
  "js/app.js",
  "js/comentarios.js",
  "js/dados.js",
  "js/filtro.js",
  "js/leitor.js",
  "js/notas.js",
  "js/renderizador.js",
  "js/seguranca.js",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/audio-waveform.svg",
  "assets/icons/chevron-down.svg",
  "assets/icons/chevron-left.svg",
  "assets/icons/chevron-right.svg",
  "assets/icons/clipboard-plus.svg",
  "assets/icons/copy.svg",
  "assets/icons/download.svg",
  "assets/icons/filter.svg",
  "assets/icons/headphones.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-leitor-claude.svg",
  "assets/icons/icon-maskable-192.png",
  "assets/icons/info.svg",
  "assets/icons/logo-leitor-claude.svg",
  "assets/icons/message-plus.svg",
  "assets/icons/message-quote.svg",
  "assets/icons/microphone.svg",
  "assets/icons/moon.svg",
  "assets/icons/notebook-pen.svg",
  "assets/icons/pause.svg",
  "assets/icons/pencil.svg",
  "assets/icons/play-mini.svg",
  "assets/icons/play.svg",
  "assets/icons/plus.svg",
  "assets/icons/refresh-cw.svg",
  "assets/icons/settings.svg",
  "assets/icons/skip-back.svg",
  "assets/icons/skip-forward.svg",
  "assets/icons/square-check.svg",
  "assets/icons/stop.svg",
  "assets/icons/sun.svg",
  "assets/icons/trash.svg",
  "assets/icons/upload.svg",
  "assets/icons/volume.svg",
  "assets/icons/x.svg"
];

async function respostaDoApp(requisicao) {
  const guardado = (await caches.match("./")) || (await caches.match("index.html"));
  if (!guardado) return fetch(requisicao);
  if (!guardado.redirected) return guardado;

  return new Response(await guardado.blob(), {
    status: 200,
    statusText: "OK",
    headers: guardado.headers
  });
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      /* addAll falha por inteiro se um arquivo faltar; aqui cada um é opcional. */
      .then((cache) => Promise.allSettled(ARQUIVOS.map((arquivo) => cache.add(arquivo))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((chave) => chave !== VERSAO).map((chave) => caches.delete(chave))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  /*
   * Navegação (inclusive o compartilhamento do sistema, que chega com ?text= na URL).
   * Vem do cache primeiro: abre instantaneamente e funciona offline.
   *
   * O cuidado com `redirected` é essencial: se o servidor responder /index.html com
   * um redirecionamento para /, a resposta guardada carrega essa marca, e o
   * navegador recusa respostas redirecionadas em requisições de navegação — a
   * página simplesmente não abre. Nesse caso a resposta é recriada limpa.
   */
  if (requisicao.mode === "navigate") {
    evento.respondWith(respostaDoApp(requisicao));
    return;
  }

  evento.respondWith(
    caches.match(requisicao).then((guardado) => {
      if (guardado) return guardado;
      return fetch(requisicao).then((resposta) => {
        if (!resposta || resposta.status !== 200 || resposta.type !== "basic") return resposta;
        const copia = resposta.clone();
        caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
        return resposta;
      });
    })
  );
});
