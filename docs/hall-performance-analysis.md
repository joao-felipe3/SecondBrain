# Analise de desempenho da tela do Hall

Data da analise: 19/11/2026

## Resumo executivo

A tela do Hall combina uma imagem panorâmica grande, CSS 3D, partículas em Canvas 2D,
marionetes em WebGL, vinhetas animadas em HTML e uma camada mobile arrastável.

O risco principal nao esta em uma unica operacao isolada, mas na soma de 7
contextos WebGL independentes, 130 particulas em Canvas, multiplas animacoes CSS,
carregamento antecipado de assets e transformacoes 3D aplicadas ao palco inteiro.

O estado atual ja possui:

- limite visual de 30 FPS para marionetes;
- limite visual de 30 FPS para particulas;
- pausa das marionetes fora da tela ou em aba oculta;
- pausa das particulas em aba oculta;
- descarte dos loops da marionete na desmontagem;
- preload essencial separado do preload em segundo plano;
- preload de frames intermediarios e texturas das marionetes;
- crossfade com o frame anterior para evitar troca brusca.

## Metricas observadas

| Item | Resultado observado |
|---|---|
| Fundo principal WebP | 1,73 MB |
| Fundo principal PNG | 27,59 MB |
| Pasta `hall-life` | 194 arquivos |
| WebP em `hall-life` | 187 arquivos, aproximadamente 2,11 MB |
| Total de WebP/PNG/JSON em `hall-life` | Aproximadamente 3,82 MB |
| Vinhetas no manifesto | 14 |
| Frames chave | 14 |
| Frames intermediarios | 11 |
| Marionetes WebGL | 7 |
| Vinhetas em primeiro plano | 2 |
| Particulas configuradas | 45 fagulhas + 85 poeiras |
| FPS visual configurado para marionetes | 30 |
| FPS visual configurado para particulas | 30 |

Os tamanhos medidos sao otimistas em relacao ao custo real no navegador, pois
decodificacao de imagens, texturas WebGL, buffers, framebuffer e layers
compositadas podem ocupar varias vezes o tamanho comprimido no disco.

## Arquitetura atual

### Fundo e panorama

A imagem principal fica em [index.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/pages/index.vue).
Ela usa:

- `object-fit: cover`;
- `transform: scale(1.7)` no desktop;
- `transform: scale(2.3)` no ultrawide;
- um ponto de origem e ancoragem dependente do modo;
- um palco 16:9 com transformacoes 3D;
- uma imagem inteira arrastavel no mobile.

Os PNG presentes nao sao utilizados enquanto o componente referencia o WebP.
Mesmo assim, o PNG nao deve permanecer como asset servido se nao houver fallback
real que o use.

### Marionetes

A implementacao em [GuildPuppetCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildPuppetCanvas.vue)
possui, por instancia:

- fetch do `puppet.json`;
- carregamento independente das imagens da marionete;
- contexto WebGL2 ou WebGL;
- framebuffer da resolucao da arte;
- textura principal;
- buffers de posicao, UV e indices;
- deformacao dos vertices das malhas;
- textura de saida;
- shader de media por area;
- loop proprio de `requestAnimationFrame`;
- `ResizeObserver`;
- `IntersectionObserver`.

Isso gera um custo alto na inicializacao e varias pilhas independentes em execucao
durante a tela. O DPR esta limitado a 2, mas a textura de saida pode usar a
resolucao completa da arte antes da reducao para a tela.

### Particulas

A implementacao em [GuildParticlesCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildParticlesCanvas.vue)
mantem 130 particulas e atualiza:

- posicao;
- velocidade;
- amortecimento;
- limites;
- vida;
- transparencia;
- cintilacao;
- interacao com ponteiro;
- reciclagem.

A renderizacao usa `clearRect`, multiplos `save/restore`, `shadowBlur` e
desenhos separados por partícula. Mesmo com o limite de 30 FPS, o navegador
continua chamado por `requestAnimationFrame` em intervalos mais altos para decidir
quando desenhar.

### Vinhetas e crossfade

A implementacao em [GuildNpcLayer.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildNpcLayer.vue)
e em [useHallLife.ts](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/composables/features/useHallLife.ts)
usa:

- uma `<img>` por frame da vinheta;
- timers por vinheta;
- crossfade entre o frame anterior e o ativo;
- CSS `filter: brightness(...)`;
- `will-change: filter`;
- intermediarios e ciclos opcionais.

Manter todas as frames no DOM estabiliza o crossfade, mas pode manter varios
assets decodificados simultaneamente. O preload em segundo plano reduz o risco
de falta do frame no momento do gesto, mas baixa muitos itens em sequencia sem
cancelamento de rede por arquivo.

### Efeitos CSS

[GuildVfxLayer.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildVfxLayer.vue)
tem multiplas tochas com:

- spritesheet de labareda;
- gradientes radiais;
- `filter: blur(...)`;
- `mix-blend-mode: screen`;
- animacoes independentes;
- `will-change`;
- pulsos sincronizados em vinhetas.

O custo do blur e da composicao varia muito por GPU. O browser precisa atualizar
essas camadas separadamente mesmo quando o usuario nao percebe movimento.

### Mobile

[useHallPan.ts](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/composables\ui\useHallPan.ts)
usa loop proprio durante arraste e inercia.

O arraste aplica `translate3d` no mundo inteiro. A imagem, WebGL, Canvas,
vinhetas e CSS ficam no mesmo contexto ampliado, sem reduzir automaticamente
o numero de elementos ativos.

## Problemas priorizados

### P0 - Alto

1. Reduzir os contextos WebGL independentes.
   Um scheduler central seria preferivel a sete componentes que chamam
   `requestAnimationFrame` independentemente.

2. Instanciar WebGL somente para marionetes visiveis.
   Atualmente a inicializacao esta ligada a montagem do componente, nao a
   visibilidade da cena.

3. Pausar canvas e renderizacao completa fora da aba.
   Os loops devem cancelar o `requestAnimationFrame` e nao apenas evitar o desenho.

### P1 - Medio/Alto

4. Reduzir particulas no mobile.
   Uma configuracao responsiva deveria usar menos fagulhas e poeiras.

5. Limitar DPR das marionetes.
   Para mobile, usar `1.25`; desktop de alto custo pode usar `1.5` ou `1.75`.

6. Limitar ou remover `shadowBlur` das particulas.
   A alternativa e desenhar em uma textura ou canvas fora da tela.

7. Revisar a composicao da imagem ampliada.
   O `filter`, `3D transform` e `preserve-3d` no palco podem forcar composicoes
   grandes durante hover e zoom.

### P2 - Medio

8. Implementar fila limitada de preload.
   Dois ou tres downloads simultaneos sao suficientes. Cancelar ao sair da tela.

9. Remover assets nao usados.
   A versao PNG de 27,59 MB nao deve permanecer como asset publicado sem fallback.

10. Remover `will-change` permanente.
    Aplicar apenas durante arraste, zoom ou gesto, nao em toda vinheta.

11. Substituir filtros CSS por uma unica camada de luz.
    Isso reduz composicao em dezenas de elementos.

## Plano recomendado

### Fase 1 - Pausa real

- cancelar RAF das particulas em aba oculta;
- cancelar RAF das particulas fora da viewport;
- cancelar RAF das marionetes fora da viewport;
- reduzir DPR no mobile;
- desativar particulas em `prefers-reduced-motion`.

### Fase 2 - Inicializacao sob demanda

- mostrar o frame de repouso imediatamente;
- criar contexto WebGL ao aproximar o NPC da viewport;
- liberar contexto WebGL ao sair do viewport;
- manter no cache somente JSON e texturas de curto prazo;
- carregar texturas intermediarias apenas ao iniciar o gesto.

### Fase 3 - Scheduler central

- um loop para marionetes visiveis;
- 24 FPS mobile e 30 FPS desktop;
- reutilizar calculos inalterados entre frames;
- evitar resize a cada 30 ciclos independentemente em cada componente.

### Fase 4 - Fallback progressivo

- mobile: marionetes CSS/frames em vez de WebGL em hardware limitado;
- conexao lenta: repouso sem vinhetas intermediarias;
- bateria baixa: desativar particulas e reduzir FPS;
- navegadores sem WebGL2/WebGL: manter a imagem de repouso.

## Metricas de aceite sugeridas

| Metrica | Desktop | Mobile |
|---|---|---|
| FPS em idle | >= 58 | >= 45 |
| FPS durante arraste | >= 55 | >= 45 |
| Long tasks | nenhuma acima de 50 ms | nenhuma acima de 80 ms |
| Contextos WebGL | <= 7, preferencialmente <= 4 | <= 3 visiveis |
| Marionetes renderizadas | 30 FPS | 24 FPS |
| Particulas | 30 FPS ou desativadas | desativadas em baixo desempenho |
| Time to image | <= 1,5 s | <= 2,5 s |
| DPR das marionetes | <= 1,5 | <= 1,25 |

## Instrumentacao de validacao

No Chrome DevTools, validar:

1. Performance > Record por 60 segundos em desktop e mobile.
2. Performance Monitor: FPS, CPU, JS heap, DOM nodes.
3. Memory > Allocation sampling durante gestos dos NPCs.
4. Rendering > FPS meter.
5. Rendering > Paint flashing.
6. Rendering > Layer borders.
7. Application > Cache Storage e Network.
8. Network: listar a carga inicial e a carga em idle.

As seguintes sequencias devem ser registradas separadamente:

- entrada no Hall;
- primeira animação das marionetes;
- arraste horizontal no mobile;
- zoom para `/tasks`;
- zoom para `/projects`;
- zoom para `/calendar`;
- retorno da aba oculta;
- dois minutos em idle.

## Verificacoes no codigo

Arquivos centrais:

- [pages/index.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/pages/index.vue)
- [GuildPuppetCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildPuppetCanvas.vue)
- [GuildParticlesCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildParticlesCanvas.vue)
- [GuildNpcLayer.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildNpcLayer.vue)
- [useHallLife.ts](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/composables/features/useHallLife.ts)
- [useHallPan.ts](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/composables/ui/useHallPan.ts)
- [GuildVfxLayer.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildVfxLayer.vue)
- [useSceneSpace.ts](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/composables/ui/useSceneSpace.ts)

## Conclusao

A tela ja possui protecoes importantes contra trabalho em aba oculta e partes
fora da tela. Os proximos ganhos devem atacar a inicializacao independente dos
sete WebGL, o custo das 130 particulas, a composicao 3D, o preload em segundo
plano e a falta de perfis separados para desktop e mobile.

## Fase 1 executada - 19/11/2026

### Alteracoes aplicadas

- [GuildParticlesCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildParticlesCanvas.vue)
  cancelou o `requestAnimationFrame` ao detectar aba oculta, viewport fora da tela
  ou `prefers-reduced-motion`.
- As particulas passaram de 130 fixas para perfis responsivos:
  - desktop: 45 fagulhas + 85 poeiras;
  - mobile: 25 fagulhas + 45 poeiras.
- [GuildPuppetCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildPuppetCanvas.vue)
  cancelou o loop ao sair da viewport ou da aba.
- O DPR das marionetes passou a ser limitado por dispositivo:
  - mobile: 1,25;
  - desktop: 1,75.
- Os limites de particulas e DPR ficaram centralizados em helpers testaveis em
  [useHallLife.ts](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/composables/features/useHallLife.ts).

### Comparacao antes/depois

| Indicador | Antes | Fase 1 | Ganho controlado |
|---|---:|---:|---:|
| Particulas mobile | 130 | 70 | 46,2% menos particulas |
| Fagulhas mobile | 45 | 25 | 44,4% menos |
| Poeiras mobile | 85 | 45 | 47,1% menos |
| DPR marionete mobile | ate 2 | ate 1,25 | ate 37,5% menos resolucao linear |
| DPR marionete desktop | ate 2 | ate 1,75 | ate 12,5% menos resolucao linear |
| Loop de particulas oculto | ativo em espera | cancelado | 100% dos callbacks cancelados nesse estado |
| Loop de particulas fora da viewport | ativo em espera | cancelado | 100% dos callbacks cancelados nesse estado |
| Loop de marionete oculto | ativo em espera | cancelado | 100% dos callbacks cancelados nesse estado |
| Loop de marionete fora da viewport | ativo em espera | cancelado | 100% dos callbacks cancelados nesse estado |

Os ganhos acima sao medidas do volume de trabalho removido. Eles nao representam
FPS medido no navegador, pois o conector CDP nao conseguiu abrir a tela para
coleta automatizada.

### Reducao estimada no trabalho idle

- Em mobile, a atualizacao por frame das particulas cai de 130 para 70 objetos.
- Em aba oculta, a particula deixa de manter callbacks ativas.
- Em viewport fora da tela, a marionete deixa de manter callbacks ativas.
- Em DPR 3 no mobile, a resolucao do canvas cai de aproximadamente
  `3.0x3.0` para `1.25x1.25`, uma reducao maxima de area de aproximadamente
  82,6%.

### Validacao

- 20 testes unitarios do Hall passaram.
- Foram adicionados testes dos perfis mobile/desktop de particulas e DPR.
- Build completo do frontend passou:
  - 3309 modulos transformados no cliente;
  - 1635 modulos transformados no servidor;
  - compilacao concluida com codigo de saida zero.
- Permanecem os avisos preexistentes de nomes duplicados em
  `KanbanCardAccents` e de chunks maiores que 500 kB.

## Fase 2 executada - 19/11/2026

### Alteracoes aplicadas

- [GuildNpcLayer.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildNpcLayer.vue)
  passou a observar a proximidade de cada vinheta.
- Cada marionete agora monta o componente WebGL somente com intersecao no
  `rootMargin` de 25%.
- Ao sair da proximidade, o componente WebGL desmonta e libera contexto,
  framebuffer, buffers e texturas pelo ciclo de limpeza existente.
- Enquanto o WebGL nao esta ativo, o frame de repouso continua sendo exibido.
- O plano de preload deixou de baixar os JSON das sete marionetes antecipadamente.
- Os JSON e texturas passam a ser carregados pelo canvas quando ele entra em
  proximidade.
- Navegadores sem `IntersectionObserver` continuam no fallback seguro e ativam
  todas as marionetes.

### Comparacao antes/depois

| Indicador | Antes | Fase 2 | Ganho controlado |
|---|---:|---:|---:|
| Marionetes montadas no inicio | 7 | so as proximas | ate 100% menos instancias fora da proximidade |
| Fetch de JSON das marionetes no inicio | ate 7 | sob demanda | ate 7 downloads removidos da carga inicial |
| Contextos WebGL criados no inicio | ate 7 | somente proximas | reducao proporcional aos NPCs fora da viewport |
| Recurso WebGL fora da proximidade | mantido | desmontado | contexto, FBO e texturas liberados |
| Imagem de repouso fora do WebGL | reserva existente | reserva mantida | sem alterar o fundo da vinheta |

O numero exato de marionetes proximas depende do tamanho da tela, panorama
mobile e posicao da camera. Portanto, os ganhos acima sao limites estruturais,
nao uma promessa fixa de FPS.

### Validacao

- 21 testes unitarios do Hall passaram.
- Foram adicionados testes para ativacao por proximidade e limites do Fase 1.
- Build completo do frontend passou:
  - 3309 modulos transformados no cliente;
  - 1635 modulos transformados no servidor;
  - bundle client, server e Nitro concluidos com codigo de saida zero.

## Fase 3 executada - 22/11/2026

### Alteracoes aplicadas

- Criado um scheduler compartilhado em
  [useHallFrameScheduler.ts](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/composables/ui/useHallFrameScheduler.ts).
- Cada marionete agora registra um callback no scheduler em vez de executar
  `requestAnimationFrame` isoladamente.
- Desktop usa 30 FPS e mobile usa 24 FPS.
- A aba oculta cancela o loop compartilhado.
- A ultima marionete removida cancela o loop compartilhado.

### Comparacao antes/depois

| Indicador | Antes | Fase 3 | Ganho |
|---|---:|---:|---:|
| Loops RAF das marionetes | ate 7 loops independentes | 1 loop compartilhado | ate 85,7% menos loops |
| Marionetes no mobile | 30 FPS | 24 FPS | ate 20% menos callbacks visuais |
| Callback quando nenhuma marionete ativa | loops possiveis por instancia | loop cancelado | zero callbacks de marionetes |

Os valores sao ganhos estruturais; FPS real ainda depende de hardware e precisa
ser medido no Chrome DevTools.

### Validacao

- 23 testes unitarios do Hall passaram.
- Foram adicionados testes do intervalo desktop/mobile e do scheduler com varios callbacks.

## Fase 4 executada - 22/11/2026

### Alteracoes aplicadas

- Criado perfil progressivo em
  [useHallLife.ts](/C:/Users/najoa/Documents/SecondBrain\SecondBrain/Frontend/composables/features/useHallLife.ts).
- Hardware com ate 4 CPUs ou ate 4 GB de memoria ativa o modo conservador.
- `saveData`, `slow-2g` e `2g` mantem o frame de repouso e evitam marionetes ou
  preload intermediario.
- [GuildParticlesCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildParticlesCanvas.vue)
  desativa particulas com movimento reduzido, perfil conservador ou bateria baixa.
- [GuildPuppetCanvas.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildPuppetCanvas.vue)
  mantem o fallback estatico quando a rede nao permite marionetes ou WebGL falha.
- [GuildNpcLayer.vue](/C:/Users/najoa/Documents/SecondBrain/SecondBrain/Frontend/components/features/hall/GuildNpcLayer.vue)
  nao monta marionetes em perfis em que elas estao desabilitadas.

### Comparacao antes/depois

| Perfil | Antes | Fase 4 |
|---|---|---|
| Hardware limitado | particulas e marionetes completas | particulas desativadas; repouso estatico mantido |
| Save Data / 2G | download completo das vinhetas | sem preload intermediario e sem marionetes |
| Bateria <=20% sem carga | particulas completas | particulas desativadas |
| Movimento reduzido | CSS reduzido; canvas ainda podia iniciar | canvas de particulas desativado |
| Sem WebGL | tentativa de contexto e fallback por falha | fallback estatico ja preservado pela vinheta |

APIs como `navigator.deviceMemory`, `navigator.connection` e
`navigator.getBattery()` dependem do navegador e podem nao estar disponiveis.
O codigo trata esses casos como perfil normal, sem bloquear a cena.

### Validacao

- 25 testes unitarios do Hall passaram.
- Foram adicionados testes para hardware limitado, Save Data, redes 2G e slow-2G.
- Build completo do frontend passou com codigo de saida zero.
