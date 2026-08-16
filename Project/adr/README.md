# 🏛️ Architecture Decision Records (ADRs) — SecondBrain

Índice central de todas as Decisões de Arquitetura tomadas no **SecondBrain**, organizadas por identificador e domínio:

| ADR         | Título                                                                                  | Domínio               |  Status   | Arquivo                                                                      |
| :---------- | :-------------------------------------------------------------------------------------- | :-------------------- | :-------: | :--------------------------------------------------------------------------- |
| **ADR-001** | Backend com NestJS + Mongoose                                                           | Backend               | ✅ Aceito | [001-why-nestjs-mongoose.md](001-why-nestjs-mongoose.md)                     |
| **ADR-002** | Separação de Módulos por Domínio                                                        | Arquitetura           | ✅ Aceito | [002-module-separation.md](002-module-separation.md)                         |
| **ADR-003** | Integração com Gemini API                                                               | Inteligência / IA     | ✅ Aceito | [003-gemini-integration.md](003-gemini-integration.md)                       |
| **ADR-004** | Estratégia de Validação em 3 Camadas                                                    | Segurança & Validação | ✅ Aceito | [004-validation-strategy.md](004-validation-strategy.md)                     |
| **ADR-005** | Motores de Visualização Gráfica (ECharts, Cytoscape & Dagre)                            | Visualização          | ✅ Aceito | [005-visualization-engine.md](005-visualization-engine.md)                   |
| **ADR-006** | Arquitetura Diegética de UI em 3 Camadas no Nuxt 3 (RPG UI)                             | Frontend              | ✅ Aceito | [006-diegetic-ui-architecture.md](006-diegetic-ui-architecture.md)           |
| **ADR-007** | Gestão de Estado Global no Frontend (Pinia + Composables)                               | Frontend              | ✅ Aceito | [007-frontend-state-management.md](007-frontend-state-management.md)         |
| **ADR-008** | Automações CI/CD e Guardrails de Qualidade (GitHub Actions, Husky & Dependency-Cruiser) | DevOps & Qualidade    | ✅ Aceito | [008-cicd-quality-guardrails.md](008-cicd-quality-guardrails.md)             |
| **ADR-009** | Observabilidade de Banco de Dados e Logging de Queries Lentas (Mongoose Interceptor)    | Observabilidade       | ✅ Aceito | [009-database-observability-logger.md](009-database-observability-logger.md) |
| **ADR-010** | Camada de Consulta Semântica e Graph RAG (LLM Wiki & Knowledge Base)                    | IA & Documentação     | ✅ Aceito | [010-graph-rag-llm-wiki.md](010-graph-rag-llm-wiki.md)                       |

---

## Estrutura Padrão de uma ADR

Cada ADR neste diretório segue o template formal:

1. **Contexto**: O problema ou força motriz por trás da decisão.
2. **Decisão**: A escolha arquitetural adotada.
3. **Drivers**: Justificativas técnicas e de produto.
4. **Detalhes de Aplicação**: Trechos de código ou configurações no repositório.
5. **Onde no código**: Links diretos para os arquivos do projeto.
6. **Consequências**: Positivas e trade-offs assumidos.
7. **Validação**: Critérios de aceite e testes.
8. **ADRs Relacionadas**: Grafo de hiperlinks entre decisões.
