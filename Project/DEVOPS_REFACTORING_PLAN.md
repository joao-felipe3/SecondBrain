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

## Sprint 2: Refactoring TasksService (0/40h) - ⏳ PRÓXIMO

### Objetivo
Reduzir `Backend/src/tasks/tasks.service.ts` de ~2067 linhas para ~400 linhas

### Services a Extrair

#### TasksRecurringService (~300 linhas)
- Lógica de recorrência (daily, weekly, monthly, custom)
- Métodos: `getNextOccurrence()`, `createRecurrence()`, `updateRecurrence()`, `calculateOccurrences()`

#### TasksPertService (~200 linhas)
- Estimativas PERT (optimistic, pessimistic, mostLikely)
- Métodos: `calculatePert()`, `suggestEstimates()`, `updatePertMetrics()`

#### TasksValidatorService (~100 linhas)
- Validação centralizada de tarefas
- Métodos: `validateTaskCreation()`, `validateTaskUpdate()`, `validateDates()`

#### TasksAiService (~250 linhas)
- Wrapper da GeminiService
- Métodos: `generateChecklist()`, `suggestTitles()`, `analyzeDeviation()`

#### TasksDeviationService (melhorar)
- Lógica de desvios (delay, scope change, priority change)
- Métodos: `recordDeviation()`, `analyzeDeviation()`, `suggestCorrections()`

### Resultado
- `TasksService`: ~400 linhas (CRUD + orquestração apenas)
- Cobertura de testes: 80%+

---

## Sprint 3: Refactoring ProjectsService (0/35h)

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

### Documentação de Guias

#### 1. **`CONTRIBUTING.md`** - Como contribuir
- Setup local environment
- Code style guide
- PR process
- Issue templates

#### 2. **`CONVENTIONS.md`** - Padrões de código
- Naming conventions (camelCase para vars, PascalCase para classes)
- File organization
- Import sorting
- Error handling patterns

#### 3. **`TESTING_STRATEGY.md`** - Estratégia de testes
- Unit tests (Jest + ts-jest)
- Integration tests (MongoDB Memory Server)
- E2E tests (Supertest)
- Coverage targets (80%+ code, 100% critical paths)
- Mocking patterns

#### 4. **`PERFORMANCE_GUIDE.md`** - Otimização
- Queries MongoDB (indexes, projections)
- Caching strategy (in-memory)
- Monitoramento
- Profiling tools

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

---

## Estimativas Totais

| Sprint | Horas | Status | Progresso |
|--------|-------|--------|-----------|
| Sprint 1: Documentação | 30 | ✅ Completo | 100% |
| Sprint 2: TasksService | 40 | ⏳ Próximo | 0% |
| Sprint 3: ProjectsService | 35 | ⏳ Futuro | 0% |
| Sprint 4: CI/CD | 25 | 🚀 Em progresso | 60% |
| Sprint 5: Patterns | 20 | ⏳ Futuro | 0% |
| **TOTAL** | **150h** | | **20%** |

---

## Próximas Ações

1. ✅ Sprint 1 concluído - Documentação de base implementada
2. 🚀 Iniciar Sprint 2 - Refactoring TasksService
3. 🔄 Continuar Sprint 4 - security.yml e analyze.yml
4. 📋 Preparar Sprint 3 - Design de ProjectsService refactoring

---

**Última Atualização**: Maio 21, 2026  
**Responsável**: DevOps Team  
**Status**: 20% completo (30/150h)
