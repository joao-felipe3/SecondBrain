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

## Sprint 3: Refactoring ProjectsService (0/35h) - ⏳ PRÓXIMO

### Objetivo
Reduzir `Backend/src/projects/projects.service.ts` de ~804 linhas para ~300 linhas

### Services a Extrair

#### ProjectsWbsService (~400 linhas)
- Lógica WBS (Work Breakdown Structure)
- Integração com WBS generator
- Métodos: `generateWbs()`, `updateWbsNode()`, `validateWbsStructure()`

#### ProjectsPertService (~200 linhas)
- Métricas PERT de projeto
- Métodos: `calculateProjectPert()`, `predictCompletion()`, `getRiskMetrics()`

#### ProjectsXMatrixService (~150 linhas)
- Matriz X (responsabilidades, alocações)
- Métodos: `updateXMatrix()`, `getResponsibilities()`, `getAllocations()`

#### ProjectsUseCases (~200 linhas)
- Operações de alto nível
- `CreateProjectUseCase`, `UpdateProjectUseCase`, `ArchiveProjectUseCase`

### Resultado
- `ProjectsService`: ~300 linhas (CRUD + orquestração)
- Camada Use Cases introduzida
- Cobertura de testes: 80%+

---

## Sprint 4: CI/CD Automations (15/25h) - 🚀 EM PROGRESSO

### Completo ✅
- `lint.yml` - ESLint + Prettier
- `test.yml` - Jest unit/integration tests com MongoDB Memory Server
- `build.yml` - Build e artifact generation

### Pendente ⏳

#### security.yml
- Dependabot vulnerability scanning
- OWASP ZAP dynamic security testing
- Trufflehog secret scanning

#### analyze.yml
- SonarQube code quality analysis
- Coverage report integration
- Complexity metrics

#### Branch Protection Rules
- Require PR reviews antes de merge
- Require all checks green
- Require up-to-date branches
- Require signed commits (opcional)

#### Pre-commit Hooks (.husky)
- Lint staged files
- Validar commit messages
- Rodar testes rápidos

---

## Sprint 5: Patterns & Consolidation (0/20h)

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
@Controller('[route]')
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

## Sprint 6: LLM Wiki — Knowledge Base (RAG) (10/20h)

### Objetivo
Criar uma camada de consulta semântica para a documentação do repositório (ADRs, DEVOPS, guias, README por módulo) utilizando RAG (retrieval-augmented generation) e embeddings.

### Por que
- Centralizar decisões arquiteturais e documentos de referência em uma base pesquisável.
- Permitir respostas contextualizadas e consistentes via LLM para suporte a devs e automações CI.

### Entregáveis
- Estrutura de fontes sob `docs/wiki/` e lista de arquivos autorizados para indexação.
- Serviço `AiWikiService` em `Backend/src/ai/ai-wiki.service.ts` + controller para query RAG.
- Script de indexação `scripts/index-wiki.ts` (gera embeddings com Gemini + armazena em vector DB local/chroma).
- Workflow GitHub Action para reindexação incremental em push (opcional/incremental).
- Testes unitários do indexer e contrato de respostas (mock do LLM).

### Componentes e design mínimo
- Fonte: arquivos Markdown/ADR/MD no repositório (`docs/`, `Project/`, `Backend/src/**/README.md`).
- Embeddings: Gemini embeddings (ou provider configurável).
- Vector DB: Chroma local (developer mode) ou integração opcional com Pinecone/Milvus.
- API: Endpoint `POST /ai/wiki-query` → recebe `query`, faz retrieval, concatena contexto e chama LLM.
- Segurança: lista de exclusão (glob) para evitar indexar secrets, `node_modules`, `.env`.

### CI / Automação
- GitHub Action `wiki-index.yml` (executa `scripts/index-wiki.ts` em push para `docs/**` e `Project/**`).
- Job incremental que só reindexa arquivos modificados (diff-based).

### Critérios de aceitação
- Endpoint de consulta retorna evidências (sources) com scores e trecho resumido.
- Pipeline de indexação rodando localmente com instruções claras em README.
- Política de privacidade/documentos sensíveis definida e aplicada (exclusões automatizadas).

### Riscos e mitigação
- Custo de embeddings: usar modo local/chroma para POC; configurar billing-aware provider para produção.
- Privacidade: nunca indexar arquivos listados em `.gitignore`/`.secrets-ignore` e validar antes de reindex.

### Estimativa
- POC: 10h (indexer + endpoint local + docs). Produção básica: 20h (CI, testes, hardening).

---

**Última Atualização**: Junho 4, 2026  
**Responsável**: DevOps Team  
**Status**: 50% completo (85/170h)

