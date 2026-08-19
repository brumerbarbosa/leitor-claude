# Leitor — Claude Code

Ferramenta web local para ouvir, revisar e comentar respostas extensas do Claude Code ou outros textos em formato Markdown.

## Como usar

1. Abra `index.html` em um navegador compatível com a Web Speech API.
2. Copie o texto desejado e use **Colar e ouvir** para trazê-lo da área de transferência, preparar o conteúdo e iniciar a leitura.
   - O navegador pode solicitar permissão para acessar a área de transferência.
3. Também é possível arrastar um arquivo `.md`, `.markdown` ou `.txt` de qualquer pasta e soltá-lo sobre a janela; o conteúdo entra direto na leitura.
3. Para ouvir o conteúdo já presente ou editado no campo, use **Ouvir**.
   - Use **Limpar texto** para esvaziar todo o campo de entrada.
4. Clique em um parágrafo para começar a leitura daquele ponto.
5. Selecione um trecho para criar um comentário contextual.

## Controles durante a leitura

- O texto fica sobre o fundo da aplicação, em uma área rolável própria com esmaecimento nas extremidades.
- Depois de carregar, o campo de texto recolhe para evitar conteúdo duplicado; use **Alterar texto** ou **Nova leitura** na sidebar para reabri-lo. Durante a edição, **Voltar à leitura** descarta as alterações ainda não aplicadas e o player continua disponível para pausar ou retomar.
- Blocos de código aparecem recolhidos no leitor, com o número de linhas e a linguagem no cabeçalho, e podem ser abertos com um clique. A voz anuncia apenas “Bloco de código em javascript com 5 linhas”, sem soletrar o conteúdo. O filtro não altera nada dentro deles.
- Links em Markdown viram links reais, abertos em nova aba, e a leitura fala apenas o rótulo, sem soletrar o endereço. Por segurança, só `http`, `https`, `mailto` e destinos internos viram links; qualquer outro esquema permanece como texto comum.
- A palavra falada no momento fica realçada dentro do trecho atual. O recurso depende de a voz escolhida informar o progresso por palavra e do suporte do navegador à Custom Highlight API; sem isso, apenas o trecho continua destacado.
- Acompanhamento automático move apenas o conteúdo interno do leitor. Uma rolagem manual o suspende e revela **Sincronizar** sobre o texto.
- O player ocupa uma faixa própria no rodapé, sem se sobrepor ao leitor ou às áreas de trabalho, com play/pausa, parar, trecho anterior, próximo trecho, timeline e velocidade.
- Voz e velocidade usam menus próprios da interface, consistentes no desktop, tablet e smartphone.
- A timeline representa a posição no texto e os tempos exibidos são estimados, pois a Web Speech API não fornece duração ou seek de áudio reais.
- Atalhos de teclado durante a leitura: **Espaço** reproduz ou pausa, **←/→** vão ao trecho anterior ou seguinte, **+/-** ajustam a velocidade e **Home** volta ao início. Eles ficam inativos enquanto o foco está num campo, botão ou menu; com o foco no texto da leitura, as setas verticais, PageUp, PageDown, Home e End rolam o conteúdo.
- Notas e comentários de seleção ficam visíveis como dois cards independentes, com notas acima e comentários abaixo. Ambos são salvos localmente no navegador.
- **Ouvir**, no card de comentários, lê a revisão em voz alta: para cada comentário são falados o trecho citado e o seu comentário, com o cartão em destaque e o texto acompanhando a marcação correspondente. A leitura principal tem prioridade — se ela for iniciada, a revisão se encerra sozinha.
- **Filtro da leitura**, em Configurações, escolhe o que sai da leitura: frases de planejamento (em português e inglês), linhas de status, nomes de arquivo soltos e contadores de alterações. É possível somar termos próprios — qualquer linha que contenha o termo é removida — e a prévia mostra quantas linhas do texto atual seriam afetadas antes de aplicar. Blocos de código nunca são alterados por nenhuma regra.
- Em **Configurações** é possível exportar a revisão em Markdown, pronta para colar de volta no chat, salvar um backup em JSON com texto, notas e comentários, e restaurar esse backup depois. Ao restaurar, as marcações voltam ao texto e comentários repetidos são ignorados.
- Ações destrutivas, como limpar notas ou apagar comentários, pedem confirmação em um diálogo do próprio app, que informa quantos itens serão perdidos. Cancelar, `Esc` ou clicar fora mantêm tudo como está.
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
│   ├── filtro.js              # Regras de ruído configuráveis, preservando código
│   ├── renderizador.js        # Markdown visual e preparação para voz
│   ├── leitor.js              # Web Speech API e controles de reprodução
│   ├── comentarios.js         # Comentários, seleção e ditado
│   ├── notas.js               # Bloco de notas persistente
│   ├── dados.js               # Exportação e importação da revisão
│   └── ajustes.js             # Tela do filtro da leitura
├── tests/
│   ├── ambiente.js            # Carrega os módulos fora do navegador
│   ├── filtro.test.js
│   ├── leitor.test.js
│   └── renderizador.test.js
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

### Testes

As funções puras — regras do filtro, conversão de Markdown, segmentação para voz e escape de HTML — são cobertas por testes que rodam com o próprio Node, sem instalar nada:

```bash
npm test
```

O `package.json` existe apenas para esse comando. A aplicação continua sem dependências, sem build e abrindo direto pelo `index.html`. Os módulos são carregados num contexto isolado por `tests/ambiente.js`, então os testes não precisam de navegador.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
