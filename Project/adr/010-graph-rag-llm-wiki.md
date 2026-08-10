# ADR-010: Camada de Consulta Semântica e Graph RAG (LLM Wiki & Knowledge Base)

## Contexto

À medida que o **SecondBrain** cresceu em documentação (ADRs, guias de refatoração, especificações de requisitos, diagramas C4 e READMEs de módulo), tornou-se necessário oferecer aos desenvolvedores e ferramentas de IA uma forma de consultar rapidamente as decisões de arquitetura e o funcionamento do codebase.

Busca vetorial pura (RAG tradicional com embeddings) frequentemente falha em responder perguntas relacionais de arquitetura (ex: _"Quais serviços dependem do WbsService e qual ADR justifica essa escolha?"_), pois não preserva os nós de relacionamento e a hierarquia entre módulos.

## Decisão

Adotar uma arquitetura de **Graph RAG (Retrieval-Augmented Generation baseado em Grafos)**:

1. **Grafo de Conhecimento com Graphify**: Indexação automatizada do repositório utilizando a ferramenta **Graphify** para mapear vértices (módulos, ADRs, endpoints, serviços) e arestas de relacionamento (dependências, chamadas, referências cruzadas).
2. **Armazenamento Híbrido**:
   - Grafo de Conhecimento armazenado sob `graphify-out/graph.json` e `graphify-out/wiki/`.
   - Embeddings de documentos de texto (ADRs, READMEs) gerados via API Google Gemini (`text-embedding-004`) e armazenados em Vector DB local (Chroma).
3. **Serviço de Consulta `AiWikiService`**:
   - Controller `POST /ai/wiki-query` que recebe perguntas em linguagem natural, executa busca híbrida (vetorial + subgrafo do Graphify), constrói um contexto enriquecido e solicita a resposta sintetizada à LLM Gemini com citações e fontes comprovadas.

## Drivers (por que essa escolha atende aos requisitos)

- **Respostas Relacionais e Rastreáveis**: O modelo recebe tanto os trechos de texto relevantes quanto o mapa de dependências (subgrafo), retornando respostas explicativas com referências exatas de arquivos.
- **Indexação Automatizada no CI**: Workflow GitHub Action `wiki-index.yml` que reindexa arquivos modificados em cada push para `docs/**` e `Project/**`.
- **Prevenção de Vazamento de Segredos**: Lista rigorosa de exclusão (`node_modules`, `.env`, arquivos de log) no pipeline de indexação.

## Detalhes de Aplicação no SecondBrain

### Pipeline de Indexação (`scripts/index-wiki.ts`)

- Executa a análise AST do Graphify gerando o arquivo `graph.json` e atualizando a documentação de referência `GRAPH_REPORT.md`.
- Converte ADRs e READMEs em chunks vetoriais enviando para o Chroma com metadados de arquivo.

### Endpoint de Consulta (`Backend/src/ai/ai-wiki.service.ts`)

```typescript
@Post('wiki-query')
async queryWiki(@Body() dto: WikiQueryDto): Promise<WikiQueryResponse> {
  // 1. Busca vetorial no Chroma DB
  // 2. Extração de subgrafo no Graphify
  // 3. Síntese contextual com Gemini API
  return this.aiWikiService.processQuery(dto.query);
}
```

## Onde no código

- **Serviço Graph RAG**: `Backend/src/ai/ai-wiki.service.ts`
- **Script de Indexação**: `scripts/index-wiki.ts`
- **Grafo de Conhecimento**: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`
- **Workflow de Automação**: `.github/workflows/wiki-index.yml`

## Consequências

### Positivas

- Resposta instantânea e contextualizada para desenvolvedores e agentes de IA sobre a arquitetura do projeto.
- Preservação da memória do projeto (rationale de decisões de código).

### Negativas / Trade-offs

- Necessidade de reindexar o grafo quando arquivos de documentação ou módulos forem alterados (`graphify update .`).

## ADRs Relacionadas

- ADR-001: [001-why-nestjs-mongoose.md](001-why-nestjs-mongoose.md)
- ADR-003: [003-gemini-integration.md](003-gemini-integration.md)
- ADR-008: [008-cicd-quality-guardrails.md](008-cicd-quality-guardrails.md)
