# DevOps Refactoring Plan - Phase 2.5

## Objetivo

Estruturar documentação, melhorar CI/CD, implementar best practices de arquitetura e preparar para escalabilidade.

## Sprint 1: Documentação de Base ✅ CONCLUÍDO (30/30h)

### ADRs (Architecture Decision Records)

#### ✅ ADR-001: NestJS + Mongoose

- **Decisão**: Usar NestJS com Mongoose como framework + ODM
- **Rationale**: Modularidade, type safety, suporte maduro, ecosistema rich
- **Aceitação**: ✅ Implementado
- **Detalhes**: `docs/adr/ADR-001-nestjs-mongoose.md`

#### ✅ ADR-002: Separação de Módulos por Domínio

- **Decisão**: Tasks, Projects, Settings como módulos independentes
- **Rationale**: Separação de concerns, reutilização, facilita testes
- **Aceitação**: ✅ Implementado
- **Detalhes**: `docs/adr/ADR-002-module-separation.md`

#### ✅ ADR-003: Estratégia de Validação em 3 Camadas

- **Decisão**: DTO validators + Mongoose schemas + Joi para env vars
- **Rationale**: Validação em diferentes níveis, type safety, clareza
- **Aceitação**: ✅ Implementado
- **Detalhes**: `docs/adr/ADR-003-validation-strategy.md`

#### ✅ ADR-005: Integração Gemini API

- **Decisão**: Gemini para sugestões de tarefas, estimativas PERT, embeddings
- **Rationale**: IA nativa, baixa latência, custo-benefício, sem overhead self-hosted
- **Aceitação**: ✅ Implementado
- **Detalhes**: `docs/adr/ADR-005-gemini-integration.md`

### C4 Architecture Diagrams

#### ✅ System Context (c4-system-context.puml)

- Usuários, SecondBrain, Google Gemini, MongoDB
- Named diagram: `@startuml c4-system-context`

#### ✅ Container (c4-container.puml)

- Backend (NestJS), Frontend (Nuxt), MongoDB, Gemini API
- Named diagram: `@startuml c4-container`
- **Cache**: In-memory Map com TTL (após remoção de Redis)

### Documentação

#### ✅ Backend/src/DEPENDENCIES.md

- Mapa de dependências entre módulos
- Identificação de ciclos conhecidos (TasksModule ↔ ProjectsModule via forwardRef)

#### ✅ Backend/src/tasks/README.md

- Descrição de serviços: TasksService, GeminiService, ChecklistService, etc.

#### ✅ Backend/src/settings/README.md

- Configuração centralizada da aplicação

#### ✅ Backend/src/projects/README.md

- Estrutura de projetos e WBS

## Sprint 2: Refactoring TasksService ✅ CONCLUÍDO (40/40h)

### Objetivo

Reduzir `Backend/src/tasks/tasks.service.ts` de ~2067 linhas para ~400 linhas

### Services a Extrair

#### ✅ TasksRecurringService (~300 linhas)

- Lógica de recorrência (daily, weekly, monthly, custom)
- Métodos: `getNextOccurrence()`, `createRecurrence()`, `updateRecurrence()`, `calculateOccurrences()`
- **Status**: ✅ Concluído

#### ✅ TasksPertService (~200 linhas)

- Estimativas PERT (optimistic, pessimistic, mostLikely)
- Métodos: `calculatePert()`, `suggestEstimates()`, `updatePertMetrics()`
- **Status**: ✅ Concluído

#### ✅ TasksValidatorService (~100 linhas)

- Validação centralizada de tarefas
- Métodos: `validateTaskCreation()`, `validateTaskUpdate()`, `validateDates()`
- **Status**: ✅ Concluído

#### ✅ TasksAiService (~250 linhas)

- Wrapper da GeminiService
- Métodos: `generateChecklist()`, `suggestTitles()`, `analyzeDeviation()`
- **Status**: ✅ Concluído

#### ✅ TasksDeviationService (melhorar)

- Lógica de desvios (delay, scope change, priority change)
- Métodos: `recordDeviation()`, `analyzeDeviation()`, `suggestCorrections()`
- **Status**: ✅ Concluído

### Resultado

- `TasksService`: ~400 linhas (CRUD + orquestração apenas)
- Cobertura de testes: 80%+

---

## Sprint 3: Refactoring ProjectsService ✅ CONCLUÍDO (35/35h)

### Objetivo

Reduzir `Backend/src/projects/projects.service.ts` de ~804 linhas para ~300 linhas

### Services Extraídos

#### ✅ WBS Services (Backend/src/projects/services/wbs/)

- `wbs.service.ts`, `wbs-generation.service.ts`, `wbs-persistence.service.ts`, `wbs-validation.service.ts`
- `task-conversion.service.ts`, `task-conversion-helper.service.ts`, `wbs-conversion-orchestrator.service.ts`
- `audit.service.ts`, `monotony.service.ts`, `cache.service.ts`, `config.service.ts`

#### ✅ Visualization Services (Backend/src/projects/services/visualization/)

- `gantt.service.ts`, `pert-diagram.service.ts`, `projects-x-matrix.service.ts`
- Utils: `gantt-helpers.util.ts`, `pert-helpers.util.ts`, `x-matrix-helpers.util.ts`

#### ✅ Strategy Services (Backend/src/projects/services/strategy/)

- `planning.service.ts`, `rolling-wave.service.ts`, `rolling-wave-planning.service.ts`

#### ✅ Execution Services (Backend/src/projects/services/execution/)

- `leaf-tasks-buffer.service.ts`, `project-stats.service.ts`, `risk.service.ts`

#### ✅ EVM Services (Backend/src/projects/services/evm/)

- `evm.service.ts`, `evm-progress.service.ts`
- Utils: `evm-calculations.util.ts`, `evm-curve.util.ts`, `evm-relevance.util.ts`

### Resultado

- `ProjectsService`: CRUD + orquestração (delegação para sub-serviços)
- Cobertura de testes: 85%+ ✅

---

## Sprint 4: CI/CD Automations ✅ CONCLUÍDO (25/25h)

### Completo ✅

- `lint.yml` - ESLint + Prettier
- `test.yml` - Jest unit/integration tests + coverage gate **85%**
- `build.yml` - Build e artifact generation
- `security.yml` - npm audit, TruffleHog secret scan, Gitleaks Action (varredura de secrets em commits/PRs), CodeQL SAST, license check
- `analyze.yml` - Coverage gates por metric, PR comment com tabela, complexity check
- `docs-render.yml` - Mermaid CLI Action para compilação automática de diagramas `.mmd` em imagens SVG/PNG na documentação

### Pre-commit Hooks (Husky) ✅

- `.husky/pre-commit` - lint-staged (ESLint + Prettier em arquivos staged) + Gitleaks local secret check
- `.husky/commit-msg` - commitlint (Conventional Commits enforced)
- `.husky/pre-push` - smoke test de unit tests (non-blocking)
- Root `package.json` + `commitlint.config.json` configurados

### Branch Protection Rules ✅ Documentado

- Documentado em `.github/workflows/README.md`
- Required checks: lint, test, build, security/audit, coverage-analysis
- Require PR review (min 1 reviewer)
- Require branches up-to-date
- Require signed commits (opcional)

---

## Sprint 5: Patterns, Guardrails & Observabilidade (25/25h) ✅ Concluído

### Arquitetura & Guardrails de Dependências (`dependency-cruiser`)

- **Ferramenta**: `dependency-cruiser`
- **Objetivo**: Enforce de arquitetura NestJS, validação de limites entre módulos e prevenção de imports circulares.
- **Entregáveis**:
  - Arquivo de regras `.dependency-cruiser.js` na raiz.
  - Script `npm run lint:deps` em `Backend/package.json`.
  - Integração no `analyze.yml` / CI para bloquear PRs com ciclos ou viés de arquitetura (ex: `TasksModule` importando diretamente controllers de `ProjectsModule`).

### Analytics de Bundle Frontend (`rollup-plugin-visualizer`)

- **Ferramenta**: `rollup-plugin-visualizer` (para Vite/Nuxt 3)
- **Objetivo**: Analisar a composição do bundle no build do Frontend para prevenir inchaço de dependências.
- **Entregáveis**:
  - Configuração no `Frontend/nuxt.config.ts` ativada sob flag `ANALYZE=true`.
  - Geração de relatório interativo `stats.html` nos artifacts de build.

### Observabilidade de Banco (`Mongoose Debug & Slow Query Logger`)

- **Ferramentas**: Interceptor/Logger customizado do NestJS + Mongoose Debug mode.
- **Objetivo**: Monitorar a saúde de consultas do MongoDB, detectar gargalos de índices e queries lentas em tempo real.
- **Entregáveis**:
  - `MongooseLoggerInterceptor` em `Backend/src/common/interceptors/mongoose-logger.interceptor.ts` registrando warnings para queries com tempo > 100ms.
  - Suporte a variável `MONGOOSE_DEBUG=true` em ambiente dev/staging para log detalhado de comandos Mongo.

### Templates de Componentes

#### Service Template

```typescript
// src/[module]/[feature].service.ts
@Injectable()
export class FeatureService {
  constructor(private readonly logger: Logger) {}

  async executeFeature(dto: FeatureDto): Promise<FeatureResponse> {
    this.logger.log(`Executing feature with ${JSON.stringify(dto)}`);
    // Implementation
  }
}
```

#### Controller Template

```typescript
// src/[module]/[feature].controller.ts
@Controller("[route]")
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Post()
  async create(@Body() dto: FeatureDto): Promise<FeatureResponse> {
    return this.featureService.executeFeature(dto);
  }
}
```

#### DTO Template

```typescript
// src/[module]/dto/create-feature.dto.ts
export class CreateFeatureDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Other fields
}
```

### Config Files

#### `.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{ts,tsx,js,jsx}]
indent_style = space
indent_size = 2

[*.{json,yml,yaml}]
indent_style = space
indent_size = 2
```

#### `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

---

## Sprint 6: LLM Wiki — Knowledge Base & Graph RAG (25/25h) ✅ Concluído

### Objetivo

Criar uma camada de consulta semântica e contextual avançada para a documentação e código do repositório (ADRs, DEVOPS, guias, READMEs por módulo) utilizando **Graph RAG** (combinação de busca vetorial com Grafo de Conhecimento).

### Por que

- Centralizar decisões arquiteturais e documentos de referência em uma base pesquisável.
- Mapear explicitamente conexões entre módulos NestJS, serviços e documentos de requisitos usando o **Graphify**.
- Permitir respostas contextualizadas, precisas e rastreáveis via LLM para suporte a devs e automações CI.

### Entregáveis

- Estrutura de fontes sob `docs/wiki/` e lista de arquivos autorizados para indexação.
- Script `scripts/index-wiki.ts` alimentado com **Graphify** para gerar o Grafo de Conhecimento da codebase + embeddings Gemini em vector DB local (Chroma).
- Serviço `AiWikiService` em `Backend/src/ai/ai-wiki.service.ts` + controller `POST /ai/wiki-query` com suporte a Graph RAG.
- Workflow GitHub Action `wiki-index.yml` para reindexação incremental em push (opcional/incremental).
- Testes unitários do indexer e contrato de respostas (mock do LLM).

### Componentes e design mínimo

- **Fonte**: arquivos Markdown/ADR/MD no repositório (`docs/`, `Project/`, `Backend/src/**/README.md`) e código fonte.
- **Grafo**: `Graphify` para mapear vértices (módulos, ADRs, endpoints) e arestas (dependências, referências).
- **Embeddings**: Gemini embeddings (ou provider configurável).
- **Vector DB**: Chroma local (developer mode) + armazenamento de estrutura de grafo (JSON/NetworkX).
- **API**: Endpoint `POST /ai/wiki-query` → recebe `query`, realiza busca híbrida (vetor + subgrafo), concatena contexto rico e chama LLM.
- **Segurança**: lista de exclusão (glob) para evitar indexar secrets, `node_modules`, `.env`.

### CI / Automação

- GitHub Action `wiki-index.yml` (executa `scripts/index-wiki.ts` em push para `docs/**` e `Project/**`).
- Job incremental que só reindexa arquivos modificados (diff-based).

### Critérios de aceitação

- Endpoint de consulta retorna evidências (sources) com scores, trechos resumidos e nós de relacionamento do grafo.
- Pipeline de indexação rodando localmente com instruções claras em README.
- Política de privacidade/documentos sensíveis definida e aplicada (exclusões automatizadas).

### Riscos e mitigação

- Custo de embeddings: usar modo local/chroma para POC; configurar billing-aware provider para produção.
- Complexidade do grafo: limitar profundidade de busca (max depth 2-3) para evitar explosão de contexto no prompt.

### Estimativa

- POC: 10h (Graphify + indexer + endpoint local + docs). Produção básica: 25h (CI, testes, Graph RAG tuning).

### READMEs de Módulo Indexáveis — Progresso

| Pasta                          | Status       | Arquivo                                             |
| ------------------------------ | ------------ | --------------------------------------------------- |
| `tasks/services/workflow/`     | ✅ Concluído | `Backend/src/tasks/services/workflow/README.md`     |
| `tasks/services/traceability/` | ✅ Concluído | `Backend/src/tasks/services/traceability/README.md` |
| `tasks/services/analysis/`     | ✅ Concluído | `Backend/src/tasks/services/analysis/README.md`     |
| `tasks/services/intelligence/` | ✅ Concluído | `Backend/src/tasks/services/intelligence/README.md` |
| `tasks/services/monitoring/`   | ✅ Concluído | `Backend/src/tasks/services/monitoring/README.md`   |

---

## Sprint 7: Performance, Profiling & Diagnóstico ✅ CONCLUÍDO (15/15h)

### Objetivo

Estruturar ferramentas e automações sob demanda para investigar gargalos de CPU, I/O, Event Loop e vazamentos de memória no Backend Node.js / NestJS.

### Ferramental Central (`Clinic.js`)

- **Ferramenta**: Suite `Clinic.js` (`@clinic/doctor`, `@clinic/flame`, `@clinic/bubbleprof`)
- **Aplicações**:
  - `Clinic Doctor`: Diagnóstico geral de saúde (CPU, Event Loop delay, I/O bottleneck, memory ticks).
  - `Clinic Flame`: Profiling de chama (Flamegraphs) para identificar funções síncronas bloqueantes no NestJS.
  - `Clinic Bubbleprof`: Mapeamento de concorrência e latência em operações assíncronas (ex: chamadas Mongo/Redis/Gemini).

### Entregáveis

- ✅ Scripts de profiling integrados em `Backend/package.json`:
  - `npm run profile:doctor`
  - `npm run profile:flame`
  - `npm run profile:bubbleprof`
- ✅ Guia prático de diagnóstico de performance em `docs/profiling-guide.md`.
- ✅ Suporte a geração de relatórios HTML para inspeção de métricas de estresse via `autocannon`.

---

**Última Atualização**: Julho 25, 2026  
**Responsável**: DevOps Team  
**Status**: 100% completo (195/195h) — Sprints 1-7 ✅ completos
