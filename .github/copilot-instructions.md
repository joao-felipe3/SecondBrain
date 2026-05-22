# GitHub Copilot Instructions

## Contexto do projeto

O SecondBrain combina:
- **Backend**: NestJS, Mongoose/MongoDB, Redis, Zod, Swagger e jobs assíncronos
- **Frontend**: Nuxt 3, Vue, Vuetify, Pinia e Vitest
- **IA**: Gemini/Gemma, function calling em JSON estrito, embeddings, RAG e orquestração
- **Domínio**: tarefas, planejamento, energia/rotina, gamificação e trilhas de execução

## Regras gerais

- Priorize o que está em `Project/REQUISITOS.md` quando houver dúvida sobre comportamento.
- Preserve a autoridade do estado no backend; o LLM deve sugerir, não inventar estado.
- Valide saídas estruturadas com schema antes de persistir ou renderizar.
- Prefira mudanças pequenas, idempotentes e rastreáveis.
- Quando tocar em uma área, mantenha seus testes e validações alinhados.

## Backend

- Use NestJS idiomaticamente: DTOs, pipes, services, guards, modules e providers bem separados.
- Para IA, use prompts curtos, saída JSON validada e fallback determinístico.
- Para tarefas e jobs, pense em fila, retry, backoff e idempotência.

## Frontend

- Favoreça componentes reutilizáveis, stores claras e estados de carregamento explícitos.
- Mantenha a UI coerente com o domínio do projeto: tarefas, dungeon/boss, energia, RAG e validação batch.
- Prefira tipagem forte e estados derivados em vez de lógica espalhada.

## Qualidade

- Em backend, considere `npm run lint`, `npm run test`, `npm run test:cov` e `npm run build`.
- Em frontend, considere `npm run test:unit`, `npm run build` e validação de componentes alterados.
- Não introduza novas abstrações sem necessidade; reutilize padrões já existentes.

## Estrutura de apoio

- `AGENTS.md`: perfis de trabalho recomendados
- `SKILLS.md`: capacidades temáticas por domínio
- `HOOKS.md`: automações locais e checagens sugeridas
- `.github/instructions/*.instructions.md`: instruções focadas por área

*Última atualização: 2026-05-21*
