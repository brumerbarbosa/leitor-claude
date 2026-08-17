# Leitor — Claude Code

Ferramenta web local para ouvir, revisar e comentar respostas extensas do Claude Code ou outros textos em formato Markdown.

## Como usar

1. Abra `index.html` em um navegador compatível com a Web Speech API.
2. Copie o texto desejado e use **Colar e ouvir** para trazê-lo da área de transferência, preparar o conteúdo e iniciar a leitura.
   - O navegador pode solicitar permissão para acessar a área de transferência.
3. Para ouvir o conteúdo já presente ou editado no campo, use **Ouvir**.
   - Use **Limpar texto** para esvaziar todo o campo de entrada.
4. Clique em um parágrafo para começar a leitura daquele ponto.
5. Selecione um trecho para criar um comentário contextual.

## Controles durante a leitura

- O texto fica sobre o fundo da aplicação, em uma área rolável própria com esmaecimento nas extremidades.
- Depois de carregar, o campo de texto recolhe para evitar conteúdo duplicado; use **Alterar texto** ou **Nova leitura** na sidebar para reabri-lo. Durante a edição, **Voltar à leitura** descarta as alterações ainda não aplicadas e o player continua disponível para pausar ou retomar.
- Acompanhamento automático move apenas o conteúdo interno do leitor. Uma rolagem manual o suspende e revela **Sincronizar** sobre o texto.
- O player ocupa uma faixa própria no rodapé, sem se sobrepor ao leitor ou às áreas de trabalho, com play/pausa, parar, trecho anterior, próximo trecho, timeline e velocidade.
- Voz e velocidade usam menus próprios da interface, consistentes no desktop, tablet e smartphone.
- A timeline representa a posição no texto e os tempos exibidos são estimados, pois a Web Speech API não fornece duração ou seek de áudio reais.
- Notas e comentários de seleção ficam visíveis como dois cards independentes, com notas acima e comentários abaixo. Ambos são salvos localmente no navegador.
- Os textos explicativos de notas e comentários ficam disponíveis nos botões de informação, ao passar o mouse ou navegar com o teclado.
- Além da seleção convencional com mouse ou toque, **Marcar trecho** adiciona uma checkbox a cada bloco da leitura. Selecione um ou vários blocos e use **Adicionar comentário**.
- A navegação se adapta ao dispositivo: sidebar completa no desktop, rail de ícones no tablet e barra inferior no smartphone.
- No smartphone, **Ajustes** reúne o controle de velocidade e a troca entre os temas claro e escuro.
- No desktop, leitura e revisão permanecem lado a lado; em telas menores, notas e comentários abrem em um painel lateral sob demanda.
- No tablet e no smartphone, o painel de revisão funciona como um drawer modal e mostra somente a ferramenta escolhida — notas ou comentários — sem reduzir a largura do leitor.
- O topbar da leitura mostra o título detectado no Markdown, um seletor persistente de voz e o acesso para alterar o texto.

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
