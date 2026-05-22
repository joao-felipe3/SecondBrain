# ADR-001: Backend com NestJS + Mongoose

## Contexto
O SecondBrain tem um backend TypeScript com responsabilidades crescentes e domínio rico:

- **Tarefas**: CRUD e estados (MVP) + micro-tarefas com checklist padrão-ouro, PERT em micro-escala e recorrência.
- **Projetos**: CRUD + associação de tarefas.
- **LLM/IA**: geração e revisão de sugestões (tarefas, WBS/EAP, estimativas PERT, dependências, feedback).

Os requisitos enfatizam **modularidade, testabilidade e consistência**

O datastore alvo é **MongoDB**, e o domínio exige:

- Modelos com campos opcionais/variáveis (tarefas, projetos, configurações)
- Estruturas hierárquicas e arrays (ex.: WBS)
- Validação de forma e regras de negócio (DTO + schema)
- Facilidade para testes (unit + integração + e2e)

## Decisão
Adotar **NestJS** como framework do backend e **Mongoose** como ODM para MongoDB (via `@nestjs/mongoose`).

## Drivers (por que essa escolha atende os requisitos)
- **Arquitetura modular**: encaixa com separação por domínio (ver ADR-002).
- **Injeção de dependência**: facilita orquestração, mock e testes isolados.
- **TypeScript-first**: DTOs, pipes/guards e tipagem consistente ao longo do request/response.
- **Validação em camadas**: class-validator nos DTOs + validação/constraints no schema.
- **Modelagem Mongo nativa**: subdocumentos, arrays, índices e validações customizadas.
- **Ecossistema e maturidade**: integrações Nest para config, logging, testes, OpenAPI, etc.

## Detalhes de aplicação no SecondBrain
- **Módulos por domínio** (Tasks/Projects/Settings) com controllers e services coesos.
- **Schemas Mongoose** como fonte de verdade para persistência (tipos, required, enums, defaults, índices).
- **DTOs** para validação de entrada e contrato de API.
- **Testes** com Jest + (quando aplicável) MongoDB Memory Server + Supertest para e2e.

## Onde no código
- Bootstrap e wiring principal: [Backend/src/main.ts](../../Backend/src/main.ts), [Backend/src/app.module.ts](../../Backend/src/app.module.ts)
- Módulos de domínio: [Backend/src/tasks/tasks.module.ts](../../Backend/src/tasks/tasks.module.ts), [Backend/src/projects/projects.module.ts](../../Backend/src/projects/projects.module.ts), [Backend/src/settings/settings.module.ts](../../Backend/src/settings/settings.module.ts)

## Consequências
### Positivas
- Base consistente para evolução do produto (fases futuras e refactors).
- Melhor testabilidade do domínio (serviços pequenos + DI).
- Mongoose oferece ferramentas adequadas para um domínio “document-oriented”.

### Negativas / Riscos
- **Risco de performance por mau uso do ODM** (ex.: queries sem índice, payloads grandes, `populate` indiscriminado).
- **Acoplamento a padrões do Mongoose**.
- **Restrições de versões** por peer dependencies do `@nestjs/mongoose`.

### Mitigações
- Padrões de query: projeções, paginação, `lean()` quando apropriado, índices explícitos.
- Revisão contínua em refactors (Fase 2.5) para manter services menores e regras claras.
- Travar versões e revisar upgrades de Nest/Mongoose com atenção a peer dependencies.

## Alternativas consideradas
- **Express + DI manual**: mais boilerplate e inconsistência (custo de manutenção alto).
- **TypeORM/MikroORM com MongoDB**: suporte/ergonomia inferiores vs. Mongoose para o domínio atual.
- **Prisma (Mongo)**: ainda com limitações relevantes para modelagem/queries avançadas em documentos.

## Como validar (critérios de aceite)
- Novos endpoints seguem padrões Nest (controller/service/dto).
- Modelos persistidos têm schema com validação e índices quando necessário.
- Cobertura de testes se mantém (unit + integração/e2e onde já existe).

## Referências
- Requisitos: [Project/REQUISITOS.md](../REQUISITOS.md)
- ADR-002: [002-module-separation.md](002-module-separation.md)
- ADR-003: [003-gemini-integration.md](003-gemini-integration.md)
