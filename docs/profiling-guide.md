# Guia de Performance, Profiling e Diagnóstico

Este documento fornece o guia prático para execução de investigações de performance, profiling de CPU, Event Loop, I/O e detecção de vazamentos de memória no Backend Node.js / NestJS do **SecondBrain**.

---

## 1. Ferramental de Profiling (`Clinic.js` Suite)

O projeto utiliza a suite **Clinic.js** em conjunto com **Autocannon** para simulação de carga e geração automatizada de relatórios visuais interativos em HTML.

A suite é composta por três ferramentas complementares:

| Ferramenta            | Foco de Diagnóstico                                     | Quando Utilizar                                                                            |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Clinic Doctor**     | Saúde geral (CPU, Event Loop Delay, I/O, Memória)       | Primeiro passo para identificar a _natureza_ de um problema de performance.                |
| **Clinic Flame**      | Profiling de CPU via Flamegraphs de pilha de execução   | Quando o Doctor indica **CPU Bound** ou lag de Event Loop por código síncrono bloqueante.  |
| **Clinic Bubbleprof** | Latência e gargalos em fluxo assíncrono (Promises, I/O) | Quando o Doctor indica **I/O Bottleneck** (Mongoose, Redis, requisições HTTP para Gemini). |

---

## 2. Como Executar os Scripts de Profiling

Todos os scripts estão configurados no `Backend/package.json`. Antes de executar qualquer profiling, certifique-se de que a aplicação backend foi compilar no diretório `dist`:

```bash
cd Backend
npm run build
```

### 2.1 Clinic Doctor (`npm run profile:doctor`)

Analisa a saúde geral da aplicação submetida a uma carga controlada via `autocannon`:

```bash
npm run profile:doctor
```

- **O que acontece**: O `clinic doctor` inicia a aplicação compilada (`dist/main.js`) e dispara o `autocannon` com 10 conexões concorrentes por 10 segundos na porta HTTP configurada.
- **Entregável**: Gera um relatório em formato HTML (`.clinic/doctor.html`) abrindo automaticamente no navegador.

### 2.2 Clinic Flame (`npm run profile:flame`)

Mapeia o consumo de CPU da aplicação através de Flamegraphs interativos:

```bash
npm run profile:flame
```

- **Leitura do Flamegraph**:
  - **Largura dos blocos**: Proporcional ao tempo de CPU gasto naquela função.
  - **Cores quentes (Vermelho/Laranja)**: Funções no topo da pilha gastando muito tempo de CPU.
  - **Inlining / V8 optimization**: Indica otimizações do runtime Node.js.

### 2.3 Clinic Bubbleprof (`npm run profile:bubbleprof`)

Mapeia a latência entre nós assíncronos e o tempo de trânsito de chamadas I/O:

```bash
npm run profile:bubbleprof
```

- **Útil para rastrear**:
  - Delays excessivos em consultas Mongoose/MongoDB.
  - Latência em pipelines ou buffers Redis.
  - Tempo de espera em chamadas externas HTTP à API do Google Gemini.

---

## 3. Testes de Carga Personalizados com `Autocannon`

É possível personalizar a intensidade do teste de estresse passando parâmetros customizados ao `autocannon`:

```bash
# Teste direto contra o servidor em execução (ex: 50 conexões concorrentes por 30 segundos)
npx autocannon -c 50 -d 30 http://localhost:3000/api
```

Parâmetros recomendados para cenários de estresse:

- `-c 50` (Conexões concorrentes simultâneas)
- `-d 30` (Duração em segundos do estresse)
- `-m POST` (Método HTTP)
- `-H "Content-Type: application/json"` (Headers HTTP)

---

## 4. Diagnóstico e Resolução de Gargalos Frequentes

### 4.1 Lag no Event Loop (Event Loop Delay > 10ms)

- **Sintoma no Doctor**: Gráfico "Event Loop Delay" subindo para a zona vermelha.
- **Causa**: Funções síncronas pesadas no main thread (ex: `JSON.parse` de payloads massivos, ordenações complexas, loops aninhados).
- **Mitigação no NestJS**:
  - Utilizar sanitizadores e parsers otimizados (`json-sanitizer.util.ts`).
  - Mover cálculos pesados (ex: recalculo PERT/CPM em lote) para Worker Threads ou tarefas assíncronas em background via Redis.

### 4.2 I/O Bottlenecks (Consultas MongoDB / Cache Redis)

- **Sintoma no Doctor/Bubbleprof**: I/O elevado com baixa utilização de CPU.
- **Causa**: Consultas MongoDB desindexadas, `find()` retornando documentos inteiros em vez de projeções finas, ou N+1 queries.
- **Mitigação no NestJS**:
  - Adicionar índices nos schemas Mongoose (`projectId`, `parentWbsNodeId`).
  - Utilizar `.lean()` em leituras Mongoose para ignorar overhead do documento Mongoose.
  - Utilizar `LeafTasksBufferService` / Redis cache para ler artefatos WBS/Drafts pré-calculados.

### 4.3 Vazamento de Memória (Memory Leak)

- **Sintoma no Doctor**: Gráfico "Memory" com tendência ascendente contínua (escada) sem retornar à linha de base após o Garbage Collection.
- **Causa**: Arrays globais acumlando referências, listeners de eventos sem `.off()`, ou caches em memória ilimitados sem TTL.
- **Mitigação**:
  - Limitar tamanho máximo de buffers em memória (`CacheService` com TTL e política LRU).
  - Limpar mapas e listeners em hooks de ciclo de vida `@OnModuleDestroy()`.

---

## 5. Resumo do Fluxo de Trabalho de Performance

1. `npm run build`
2. `npm run profile:doctor` (Identificar gargalo: CPU vs I/O vs Memory)
3. Caso CPU: `npm run profile:flame` -> Corrigir hotpaths
4. Caso I/O: `npm run profile:bubbleprof` -> Otimizar índices/queries Mongo/Redis
5. Validar melhoria reexecutando o teste de carga com `autocannon`
