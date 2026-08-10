# ADR-002: Separação de Módulos por Domínio

## Contexto

Os requisitos do SecondBrain cobrem domínios com mudanças e complexidade diferentes:

- **Tasks**: CRUD, recorrência, checklist, PERT micro, Kanban/fluxo.
- **Projects**: CRUD, associação com tasks, WBS/EAP, PERT/CPM, Gantt, X-Matrix.
- **Settings**: configurações do usuário e do sistema.

Sem limites claros, o backend tende a:

- acumular regras de negócio em poucos arquivos,
- criar acoplamento acidental,
- dificultar testes e refactors.

## Decisão

Organizar o backend em módulos por domínio:

- `TasksModule`
- `ProjectsModule` (com subáreas como planning/WBS quando fizer sentido)
- `SettingsModule`

Além disso, manter módulos transversais (ex.: config e infraestrutura) **sem** misturar regras de domínio.

## Onde no código

- Modules (Nest): [Backend/src/tasks/tasks.module.ts](../../Backend/src/tasks/tasks.module.ts), [Backend/src/projects/projects.module.ts](../../Backend/src/projects/projects.module.ts), [Backend/src/settings/settings.module.ts](../../Backend/src/settings/settings.module.ts)

## Regras de fronteira (guardrails)

- Controllers e DTOs ficam no módulo do domínio.
- Services de domínio não importam detalhes internos de outros módulos; quando necessário:
  - expor apenas o que é estável via `exports` do módulo,
  - ou criar um “orquestrador”/service de aplicação que coordena fluxos cross-domain.
- `forwardRef()` é permitido como exceção (hoje há um ciclo conhecido Tasks ↔ Projects), mas a meta é reduzir esse tipo de acoplamento durante refactors.

## Consequências

### Positivas

- Navegação mais fácil (onde procurar o quê).
- Escopo menor por arquivo/service (refactor incremental mais seguro).
- Testes mais focados por domínio.

### Negativas / Trade-offs

- Fluxos cross-domain exigem decisões explícitas (interfaces, exports, orquestração).
- Pode existir duplicação pontual de DTOs/view-models para evitar dependências internas.

## Alternativas consideradas

- **Módulo único (monolito interno)**: mais rápido no início, mas degrada rápido com features e fases futuras.
- **Somente camadas (controllers/services/repos) sem domínio**: dificulta ownership e aumenta “service sprawl”.

## Como validar (critérios de aceite)

- Cada feature nova entra no módulo correto.
- Imports entre módulos são mínimos e revisados.

## Referências

- Requisitos: [Project/REQUISITOS.md](../REQUISITOS.md)
- ADR-001: [001-why-nestjs-mongoose.md](001-why-nestjs-mongoose.md)
- ADR-003: [003-gemini-integration.md](003-gemini-integration.md)
- ADR-004: [004-validation-strategy.md](004-validation-strategy.md)
- ADR-005: [005-visualization-engine.md](005-visualization-engine.md)
- ADR-006: [006-diegetic-ui-architecture.md](006-diegetic-ui-architecture.md)
- ADR-007: [007-frontend-state-management.md](007-frontend-state-management.md)
- ADR-008: [008-cicd-quality-guardrails.md](008-cicd-quality-guardrails.md)
- ADR-009: [009-database-observability-logger.md](009-database-observability-logger.md)
- ADR-010: [010-graph-rag-llm-wiki.md](010-graph-rag-llm-wiki.md)
