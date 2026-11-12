# Hall Life: vida no Saguão sem cara de colagem

Pipeline que povoa o saguão (`pages/index.vue`) com vinhetas animadas — gente bebendo, planejando, lendo o mural, tocando música — **pintadas dentro da própria ilustração**, não coladas por cima.

## Por que não "recortar personagens e colar"

Personagens desenhados isolados (fundo chroma) quase sempre denunciam a colagem: luz vinda de outro lugar, traço com espessura errada depois do redimensionamento, borda suja do recorte, nenhuma sombra de contato e nenhuma oclusão real pelos móveis.

Aqui o modelo recebe **o pedaço real da cena** (a "placa") e devolve a mesma placa com o personagem pintado nela. Ele herda luz, perspectiva, traço e oclusão. Depois extraímos só o que mudou.

## Fluxo

```
vignettes.json
   │
   ├─ generate.py plate-and-a   placa (da composição acumulada) → N variações do frame A (Gemini, edição)
   ├─ generate.py pick          escolhe a variação olhando work/previews/<id>-variants.jpg
   ├─ generate.py frames        frames b, c… como EDIÇÃO do frame A ("mude só o braço…")
   ├─ extract.py                alinha (ECC) → corrige cor → máscara por ΔE → máscara-união → feather
   ├─ quality_gate.py           costura, salto de cor, deriva, espessura do traço + folha de revisão
   ├─ run_photoshop.py build    (opcional) monta work/photoshop/Hall-Life.psd para retoque manual
   ├─ run_photoshop.py export   (opcional) exporta de volta do PSD, sem perda
   └─ export.py                 WebP em public/vfx/hall-life/, assets/data/hall-life.json, composição
```

Exemplo completo de uma vinheta:

```bash
cd Frontend/scripts/hall-life
python generate.py plate-and-a --only dwarf-crate --variants 2
python generate.py pick --only dwarf-crate --variant 2
python generate.py frames --only dwarf-crate
python extract.py --only dwarf-crate
python quality_gate.py --only dwarf-crate
python export.py --only dwarf-crate
```

Requisitos: Python com `pillow`, `numpy` e `opencv-python-headless`. A chave vem de `Backend/.env` (`GEMINI_API_KEY`).

## Regras que evitam a colagem

- **Placa nativa, nunca redimensionada para cima**: o patch volta exatamente para o pixel de onde saiu.
- **Composição acumulada**: a placa de cada vinheta é tirada de `work/composite.png` (cena + vinhetas já exportadas), então vinhetas vizinhas se enxergam.
- **Frames por edição**: b, c… editam o frame A; o extrator ainda limita cada frame à região que se moveu. O crossfade não fantasma.
- **Máscara-união com feather**: todos os frames usam o mesmo alpha; a borda cai sobre pixels quase iguais ao fundo.
- **Portão de qualidade**: reprova costura (> 1,6× o gradiente do entorno), salto de cor (ΔE > 7 no anel da borda), deriva (> 4% da placa alterada fora do personagem) e traço fora de 0,65–1,5× o do cenário.
- **Janela visível**: o fundo é exibido com `cover` + `scale(1.7)`; só a faixa u 0,245–0,833 × v 0,334–0,828 aparece em 16:9, e o ultrawide corta abaixo de v 0,682. As `area` do manifesto precisam estar nessa faixa. Use `/?sceneDebug=1` no navegador para ver a grade em frações da imagem.

## Gestos: mais vida em cada vinheta

Cada vinheta pode ter vários frames além do repouso (`a`), todos gerados como edição do `a`. No front, o padrão (`"sequence": "gestures"`) alterna repouso e um gesto sorteado (a → c → a → b…), sem repetir o mesmo gesto duas vezes seguidas. Use `"sequence": "loop"` para movimento contínuo (ex.: o bardo dedilhando).

Ajustes de extração por vinheta (`"extract"`): `motion_blur` e `motion_threshold` controlam a sensibilidade a gestos pequenos (olhar, piscar); `motion_reach` (px) limita até onde o gesto pode ir a partir do personagem — evita que objetos inventados no cenário entrem na animação.

## Intermediários: movimento fluido (como os 8 frames da porta)

Cada gesto pode ter quadros intermediários desenhados (`tweens` no manifesto). O runtime toca
repouso → `b_1` → `b_2` → `b` (140 ms por passo em média, com ease-in-out: pontas mais lentas e meio mais rápido; cada quadro dissolve por cima do anterior durante o passo inteiro)
e, na volta ao repouso, os mesmos ao contrário.

```
python Frontend/scripts/hall-life/generate.py tweens --only dwarf-crate [--names b_2] [--force]
```

- Descreva a pose de cada intermediário (`"tweens": ["mug at belly height", "mug at chest height"]`).
  Eles são gerados em cadeia (cada um edita o anterior). Com as duas chaves visíveis
  (`"tweens": 2`), o modelo tende a copiar a pose final.
- Interpolação por fluxo óptico não serve: braços e canecas viram fantasma.
- Confira na tira se houve movimento: o `extract.py` imprime "movimento em X%". 0% significa
  um intermediário igual ao repouso, então remova-o.
- **Mais quadros onde ainda pula:** `gaps.py` mede o salto entre quadros vizinhos de cada gesto.
  `inbetween.py gen` desenha um quadro no MEIO de cada salto grande (o Gemini vê os dois vizinhos;
  uma checagem rejeita resultados iguais a um vizinho ou fora do caminho e tenta de novo).
  Depois rode `inbetween.py apply`, uma vez, para renumerar os arquivos. Para descartar um quadro
  ruim, use `inbetween.py drop --only <id> --names d_3`. A maioria dos gestos tem 5–8 quadros,
  como a porta.
- **Quando o meio automático falha** (com vizinhos próximos o redesenho do modelo já é do tamanho do
  movimento e quase tudo é rejeitado): `inbetween.py describe --only dwarf-crate --gesture c --after
c_2 [--from c_3] [--variants 3] --desc "..."` encaixa poses DESCRITAS depois de `--after`.
  - Nomeie a mão pelo LADO DA IMAGEM ("a mão do lado direito da imagem, perto do barril"); "mão
    livre" fez o modelo trocar a caneca de mão.
  - Partindo do repouso o modelo mexe pouco; `--from` com o quadro SEGUINTE ("baixe a mão até o
    peito") acerta melhor a pose do meio.
  - `--variants` fica com a variante que menos redesenhou o resto.
  - Se ainda assim a cabeça mudar, `inbetween.py lock --only <id> --name c_3 --from c_4 --rect x0 y0
x1 y1 ...` (frações do quadro bruto) copia essas regiões do vizinho bom, alinhado.
  - Depois: `apply`, `extract.py`, `gaps.py` e SEMPRE revisar as tiras.
- O export usa WebP com qualidade 92 e alfa sem perda (cerca de 3x menor que lossless).

## Marionete (`rig.py`): o jeito preferido para gestos

Como a porta: o MESMO desenho deformado, então nada "ferve" entre quadros e dá para gerar 24+.
O Gemini entra só onde a deformação 2D não basta (perspectiva, mão abrindo, olhos).

1. `rig.py clean --only <id> --gesture b` — o Gemini pinta UMA vez o personagem sem a peça que
   se move (o que fica atrás dela). Fica a variante que melhor casa com o repouso; revise
   (uma variante do Gloin apagou a caneca junto).
2. No `vignettes.json`, o frame ganha `rig`: `roi`, `chain` (ex.: ombro→cotovelo→punho→mão) e
   `keys`: chaves em ordem (`a`, intermediários do Gemini como `c_3`, `drawn` = desenho final),
   cada uma com `t`, `pins` e `poly` (polígono amplo; o recorte fino vem da placa limpa). Coordenadas
   em pixels do quadro A bruto. Marque os alfinetes numa folha com grade fina e confira o
   cotovelo pelo contorno da manga (um cotovelo errado faz o antebraço "dar meia-volta").
   Opções por chave: `morph` (trecho da troca de desenho; troca curta [0.35, 0.65] quando os
   desenhos diferem muito), `morph_ramp` (perspectiva só na parte distal), `fit` (alinha os
   alfinetes ao desenho), `whole`/`keep` (peça sempre inteira / nunca se move).
   `key_regions` trazem partes do desenho final no fim do movimento (olhos, espuma).
   `ik: ["S", "E", "W"]` mantém braço e antebraço com o comprimento do repouso: a mão segue o
   caminho e o cotovelo é calculado (sobe e avança). Sem isso, um cotovelo parado obriga o
   antebraço a ESTICAR até a boca. Com IK, a placa limpa precisa vir sem o braço inteiro
   (revise: algumas variantes deixam um "toco" sob a ombreira).
   `whole_poly`: polígono JUSTO da peça sempre inteira (um retângulo largo arrastava túnica junto).
   `loop: {pivot, angle, frames, cycles, ms}` gera `<g>_loop_k`: a peça final gira em volta do
   alfinete e volta (goles do Gloin); o site toca esse ciclo enquanto a pose está parada.
3. `rig.py gen --only <id> --gesture b` — gera `<g>_1..N` e a pose final; o desenho original vira
   `<g>.drawn.png` e os intermediários antigos do Gemini vão para `_gemini_<g>/`.
4. `extract.py`, `quality_gate.py`, `export.py`. `tweenMs` no frame dá o ritmo do gesto no site
   (Gloin: 24 quadros a 40 ms ≈ 1 s).

## Marionete em tempo real no site (`rive_rig.py`)

O rig do `rig.py` (peças, alfinetes, placas limpas, IK, ciclos) vira uma marionete que o site anima
em tempo real a 60 fps, sem quadros pré-renderizados (Gloin: ~300 KB contra 1,4 MB de quadros).

    python Frontend/scripts/hall-life/rive_rig.py --only dwarf-crate --site      # gera e liga no site
    python Frontend/scripts/hall-life/rive_rig.py --only dwarf-crate --entry b   # só gera (prévia no Rive)

- Saída em `work/rive/<id>/`: `puppet.json` + imagens (o que o site usa) e um `.rml` equivalente.
- `--site` copia para `public/vfx/hall-life/<id>/puppet/` e grava `puppet` no `hall-life.json`
  (o `export.py` preserva essa chave). Para voltar aos quadros, apague a chave.
- No site: `GuildPuppetCanvas.vue` (WebGL2 com mipmaps) + `composables/ui/puppet.ts` (ossos,
  keyframes, skinning — testado em `tests/unit/puppet.spec.ts`). `?puppetT=b@1.2` congela o gesto b
  em 1,2 s para inspeção.
- **Prévia no Rive (opcional, gratuita, sem login):** `~/.rive/bin/rive work/rive/<id>` abre uma
  janela; `--screenshot`/`--commands` renderizam quadros. Não publicamos `.riv` no site: o plano
  gratuito mostra uma tela preta com o logo do Rive sobre o NPC.
- Pegadinhas do RML: o PRIMEIRO elemento desenhado fica NA FRENTE; cada `ImageAsset` precisa de
  `assetId` próprio (senão a imagem some sem erro).

## Personagem na frente de um efeito animado

Os efeitos do `GuildVfxLayer` (chamas das tochas e da lareira) são desenhados acima das vinhetas. Quando um personagem está na frente de uma chama, adicione ao manifesto:

```json
"foreground": { "box": [0.5, 0.15, 0.82, 0.7] }
```

`box` são frações do patch onde estão os personagens que devem ficar na frente. O `export.py` recorta dali só a silhueta (diferença forte contra a cena original, sem o fundo) e o front desenha essa silhueta acima dos efeitos, trocando de frame junto com a vinheta. Exemplo em uso: o cavaleiro do `drinkers-hearth` diante da lareira.

## Escala de personagens em pé

O modelo respeita bem a escala quando o prompt amarra o corpo ao recorte: dimensione a `area` com a altura que o personagem deve ter naquela profundidade (compare com vinhetas vizinhas, ex.: o orc do mural tem ~420 px de imagem) e peça "full body spans about 85% of the image height, boots near the bottom edge".

## Photoshop (local, por ExtendScript)

`run_photoshop.py` passa um `.jsx` para o `Photoshop.exe` e lê o resultado num `.txt`. O PSD de trabalho cobre só a janela visível (cerca de 4000×1900) para caber no disco. A volta PSD → WebP é idêntica pixel a pixel, então retoques manuais no `Hall-Life.psd` chegam ao site.

Rode pelo **PowerShell** (o terminal Bash do agente não abre aplicativos com janela). Precisa de pelo menos 3,5 GB livres no C:. Ao terminar, `python run_photoshop.py close` fecha os documentos e encerra o Photoshop para devolver a memória.

## No frontend

- `components/features/hall/GuildSceneSpace.vue` — contêiner que coincide com a imagem renderizada (mesmo cover, posição e escala do `.master-bg`). Filhos usam frações da imagem.
- `composables/ui/useSceneSpace.ts` — a geometria em funções puras (`sceneSpaceStyle`, `imageToStageRect`). Se o CSS do `.master-bg` mudar, atualize `HALL_STAGE_MODES`.
- `components/features/hall/GuildNpcLayer.vue` + `composables/features/useHallLife.ts` — empilha os frames, troca com crossfade de 220 ms em tempos sorteados por frame (`hold`), pulsa o brilho no ritmo das tochas/lareira (`light`), pausa com a aba oculta e respeita `prefers-reduced-motion`.

## Pasta `work/`

Tudo em `work/` é intermediário e fica fora do git (placas, saídas brutas do Gemini, extrações, prévias, PSD de trabalho, `state.json` com as variações escolhidas).

### Estado entre gestos (ex.: barba suja → limpar)

O gesto pode mudar o personagem de forma duradoura. No Gloin, cada gole suja a barba de espuma, e
limpar o bigode só é sorteado com a barba suja (e fica mais provável quanto mais suja).

1. Arte do estado: `python rig.py overlay --only dwarf-crate --name dirt --region x0 y0 x1 y1 --desc "..."`.
   O Gemini pinta a mudança no repouso; fica a variante que menos mexeu fora da região
   (`work/raw/<id>/overlay_dirt.png`; revise).
2. Em `vignettes.json`, na vinheta:
   - `puppet_state.vars.<nome>`: `overlay`, `region`, `origin` (boca), `stages`, `lift`. Só entram os
     pixels que clarearam mais que `lift` (espuma e gotas, sem o redesenho leve da barba). Eles são
     divididos em estágios, do mais perto de `origin` para fora.
   - `puppet_state.effects.<gesto>`: `[{"var", "add" | "to", "at": "start" | "loop" | "return"}]`.
     `return` é a caneca saindo da boca; `loop` é o ciclo da pose parada.
   - `puppet_state.weightBy.<gesto>`: o peso do sorteio é multiplicado pela variável.
3. Inspeção no site: `?puppet_dirt=3` começa com a barba no máximo (combina com `?puppetT=c@1.6`).

O gole na garganta (`rig.gulp`: `center`, `radius`, `amount`, `count`) e o punho em um movimento só
(`loop.continuous`) também ficam no rig do gesto.

## Marionete em loop (`loop_rig.py`): personagem que não para (ex.: bardo)

Para quem repete um movimento contínuo (tocar, mexer o caldeirão), não há poses desenhadas. Uma
malha cobre as regiões que se mexem e é deformada por ossos com pesos suaves (mesh deform, como no
Spine/Rive). Os movimentos são procedurais e seguem um andamento:

- `strum`: desce rápido no tempo, sobe devagar;
- `nod`: a cabeça marca a batida, com `sway` (balanço lento);
- `tap`: a ponta do pé sobe e bate no tempo.

Por baixo da malha fica a `base`, o repouso com as regiões móveis preenchidas por inpaint. Assim,
quando a mão sobe, aparece alaúde/fundo, e não uma segunda mão.

Config em `vignettes.json` → `loop_rig` (`bpm`, `bones`, `motions`, `anims`; ver o docstring do script).
Cada trecho de `anims` tem a duração de alguns tempos. `look` vira um osso e volta (o bardo olha para
o mezanino). Os trechos se emendam sem pausa (`weights.idle = 0`).

python Frontend/scripts/hall-life/loop_rig.py --only stair-bard --site
python Frontend/scripts/hall-life/export.py --only stair-bard # o site passa a guardar só o repouso

### Virar a página (recepcionista)

- `page_flip`: a página da direita gira em volta da lombada e pousa à esquerda (quadros renderizados,
  troca seca de um por quadro). `occluders` + `front` (contorno traçado à mão, refinado por GrabCut na
  linha de tinta; `front_cut` tira sobras como a página junto ao bico da pena) viram uma peça própria
  (`maos_frente`), presa aos mesmos ossos e desenhada por cima da folha: a mão pode se afastar e o
  recorte vai junto.
- Embaixo do que se move, `fill` de um osso pode ser uma cena limpa do Gemini sem aquela parte
  (`rig.py overlay --name nowrite ...`), em vez de inpaint.
- `poses`: mão desenhada pelo Gemini numa pose nova (ex.: no canto da página). Da pose entram só a
  silhueta da mão (`hand` + `hand_cut`) e um tampão (`clean`: cena sem a mão antiga). Com `reach`, a
  mão anda até a pose por um trilho (`from` → `to`, com `lift` e `turn`) em vez de dissolver.
- `vars` + `weightBy`: só vira depois de escrever algumas linhas (`linhas`).
