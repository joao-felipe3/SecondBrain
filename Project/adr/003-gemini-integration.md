# ADR-003: Integração com Gemini API

## Contexto
O SecondBrain usa LLM como parte do **core do produto**, não como “extra”. Nos requisitos, a IA suporta:

- geração/edição/aceite de sugestões (MVP - Integração com IA),
- Catchball (perguntas estratégicas), objetivos SMART,
- geração e decomposição de WBS/EAP (com regra 8/80),
- identificação de dependências e suporte a PERT/CPM,
- micro-tarefas com checklists padrão-ouro e feedback.

Isso exige uma integração **consistente**, com **guardrails** para:

- validação de saída,
- previsibilidade do formato,
- retries/timeouts,
- observabilidade,
- e proteção contra vazamento de dados sensíveis.

## Decisão
Integrar a Gemini API por meio de uma camada de serviço centralizada (ex.: `GeminiService`), responsável por:

- montar prompts de forma padronizada,
- escolher/configurar modelo,
- lidar com erros/retries/timeouts,
- validar e normalizar outputs,
- expor métodos “de domínio” (ex.: checklist, estimativas PERT, embeddings), em vez de respostas genéricas.

## Detalhes (como isso se aplica no backend)
- A camada de IA é consumida por services do domínio (principalmente `TasksModule` e `ProjectsModule`), evitando chamadas diretas em controllers.
- Toda saída de IA relevante ao domínio deve ser:
  - parseada para estrutura esperada,
  - validada (shape + constraints),
  - e ter fallback quando inválida.

## Onde no código
- Serviço central: [Backend/src/ai/gemini.service.ts](../../Backend/src/ai/gemini.service.ts)
- Testes (mocks/contratos): [Backend/src/ai/gemini.service.spec.ts](../../Backend/src/ai/gemini.service.spec.ts), [Backend/src/ai/gemini.service.pert.spec.ts](../../Backend/src/ai/gemini.service.pert.spec.ts)

### Cache
- Respostas de IA que são **repetidas** (ex.: sugestões idênticas) podem ser cacheadas.
- **Estado atual**: cache é **in-memory** (por processo) usando `Map` com TTL.
- **Não** há Redis/distributed cache no momento; se o backend evoluir para múltiplas instâncias, essa decisão deve ser revisitada.

### Segurança e privacidade (guardrails mínimos)
- Não logar prompts completos nem payloads com dados sensíveis.
- Sanitizar dados antes de enviar ao provedor (reduzir PII e ruído).
- Validar/limitar tamanho de input e output.
- Tratar timeouts e erros do provedor sem derrubar fluxos críticos.

## Consequências
### Positivas
- Integração previsível e testável (mock em um ponto só).
- Evolução rápida de prompts sem “espalhar” lógica em múltiplos serviços.
- Centralização de telemetria (latência, taxa de erro, retries).

### Negativas / Trade-offs
- Requer disciplina: ninguém deve “furar” a camada e chamar a API direto.
- Outputs de IA continuam não determinísticos; validação/fallback é obrigatória.
- Cache in-memory não compartilha estado entre instâncias (trade-off aceito no momento).

## Alternativas consideradas
- **Chamadas diretas** à API em controllers/services: acoplamento, baixa testabilidade, difícil observabilidade.
- **Múltiplos provedores ao mesmo tempo**: complexidade alta para o estágio atual.
- **LLM self-hosted**: custo/ops desnecessário para o MVP e fases atuais.

## Como validar (critérios de aceite)
- Todo uso de IA passa pela camada central.
- Respostas são validadas e têm fallback.
- Testes conseguem mockar IA sem rede.

## Referências
- Requisitos: [Project/REQUISITOS.md](../REQUISITOS.md)
- ADR-001: [001-why-nestjs-mongoose.md](001-why-nestjs-mongoose.md)
- ADR-002: [002-module-separation.md](002-module-separation.md)
