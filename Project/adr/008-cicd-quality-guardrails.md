# ADR-008: Automações CI/CD e Guardrails de Qualidade (GitHub Actions, Husky & Dependency-Cruiser)

## Contexto

Com a rápida evolução das regras de negócio (WBS, PERT, EVM, X-Matrix, IA) e a refatoração contínua de serviços críticos no backend e frontend do **SecondBrain**, havia o risco de regressões, vazamento de credenciais em commits, violações de arquitetura (imports circulares entre módulos NestJS) e perda de cobertura de testes.

## Decisão

Implementar uma **Esteira Automatizada de Qualidade e Guardrails (CI/CD)** em duas frentes complementares:

1. **Pre-commit Hooks Locais (Husky + lint-staged + commitlint)**:
   - Validação imediata de lint e formatação em arquivos _staged_ (`.husky/pre-commit`).
   - Varredura de credenciais/secrets em commits locais com **Gitleaks**.
   - Garantia do padrão _Conventional Commits_ (`.husky/commit-msg`).

2. **Pipeline de Integração Contínua (GitHub Actions workflows em `.github/workflows/`)**:
   - `lint.yml`: Validação de sintaxe ESLint + Prettier.
   - `test.yml`: Execução de testes unitários e de integração com **Coverage Gate mínimo de 85%**.
   - `build.yml`: Verificação de compilação do NestJS e Nuxt 3.
   - `security.yml`: Audit de dependências npm, CodeQL SAST e varredura de segredos.
   - `analyze.yml`: Análise de complexidade e validação de dependências com **`dependency-cruiser`** (`.dependency-cruiser.js`) para impedir imports inválidos ou cíclicos entre módulos.
   - `docs-render.yml`: Compilação automática de diagramas Mermaid `.mmd` em imagens SVG/PNG na documentação.

## Drivers (por que essa escolha atende aos requisitos)

- **Prevenção na Origem**: Previne commits com erros de lint ou mensagens fora do padrão antes mesmo de envios ao GitHub.
- **Proteção contra Regressões de Cobertura**: O `test.yml` bloqueia PRs que reduzam a cobertura de testes para menos de 85% nos serviços refatorados.
- **Enforcement da Arquitetura NestJS**: `dependency-cruiser` impede que o `TasksModule` importe controllers ou detalhes internos do `ProjectsModule` diretamente sem passar por interfaces autorizadas.

## Onde no código

- **Workflows GitHub Actions**: `.github/workflows/` (`lint.yml`, `test.yml`, `build.yml`, `security.yml`, `analyze.yml`, `docs-render.yml`)
- **Git Hooks**: `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`
- **Configurações de Arquitetura & Qualidade**: `.dependency-cruiser.js`, `commitlint.config.json`, `.prettierrc`, `.editorconfig`

## Consequências

### Positivas

- Confiança total na adição de novas funcionalidades e refatorações de código.
- Impossibilidade de commitar credenciais ou chaves de API acidentalmente.
- Documentação e diagramas mantidos sincronizados automaticamente.

### Negativas / Trade-offs

- Tempo adicional na execução de commits locais (poucos segundos para o Husky rodar o lint-staged).
- Necessidade de atualizar regras do `dependency-cruiser` ao criar novos bounded contexts.

## Validação (Critérios de Aceite)

- Tentativa de commitar arquivo com erro de ESLint é rejeitada pelo Husky localmente.
- PRs com violação de import circular são bloqueados no CI com relatório detalhado.

## ADRs Relacionadas

- ADR-002: [002-module-separation.md](002-module-separation.md)
- ADR-004: [004-validation-strategy.md](004-validation-strategy.md)
