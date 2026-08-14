# Leitor — Claude Code

Ferramenta web local para ouvir, revisar e comentar respostas extensas do Claude Code ou outros textos em formato Markdown.

## Como usar

1. Abra `index.html` em um navegador compatível com a Web Speech API.
2. Cole uma resposta no campo principal.
3. Use **Carregar e Ouvir** para remover ruídos e iniciar a leitura, ou **ouvir sem filtro** para preservar todo o conteúdo.
4. Clique em um parágrafo para começar a leitura daquele ponto.
5. Selecione um trecho para criar um comentário contextual.

Não há instalação, dependências de terceiros ou backend. Os arquivos JavaScript são scripts tradicionais com `defer`, então a aplicação também funciona quando `index.html` é aberto diretamente por `file://`.

## Estrutura

```text
leitor-claude/
├── index.html                 # Estrutura da interface
├── css/
│   └── styles.css             # Tema, componentes e responsividade
├── js/
│   ├── app.js                 # Inicialização e coordenação
│   ├── seguranca.js           # Escape de HTML e leitura segura de JSON
│   ├── filtro.js              # Remoção de ruídos de respostas de agentes
│   ├── renderizador.js        # Markdown visual e preparação para voz
│   ├── leitor.js              # Web Speech API e controles de reprodução
│   ├── comentarios.js         # Comentários, seleção e ditado
│   └── notas.js               # Bloco de notas persistente
└── assets/
    ├── icons/
    └── images/
```

## Dados e privacidade

Comentários e notas são armazenados no `localStorage` do navegador. A aplicação não possui servidor próprio. Dependendo do navegador e da voz selecionada, síntese e reconhecimento de voz podem usar serviços remotos do navegador ou do sistema operacional.

## Compatibilidade

- A leitura depende de `window.speechSynthesis`.
- O ditado depende de `SpeechRecognition` ou `webkitSpeechRecognition`.
- As vozes disponíveis variam conforme navegador e sistema operacional.

## Desenvolvimento

O tema visual começa pelas variáveis declaradas em `:root`, no topo de `css/styles.css`. Alterar esses tokens permite experimentar com cores, bordas, raios e sombras sem modificar a lógica da aplicação.

Como próximo passo, vale adicionar testes automatizados para as regras do filtro e para a transformação de Markdown.
