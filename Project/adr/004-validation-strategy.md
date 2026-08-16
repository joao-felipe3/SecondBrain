# ADR-004: Estratégia de Validação em 3 Camadas

## Contexto

No desenvolvimento do **SecondBrain**, payloads entram por múltiplos pontos (requisições HTTP REST, formulários no frontend, arquivos de configuração `.env`, inserções em lote no bulk endpoint, e payloads retornados por chamadas à API do Google Gemini).

Sem um padrão rígido de validação:

- Erros de tipagem ou ausência de campos obrigatórios chegam às camadas de banco de dados ou calculadoras de PERT/EVM.
- Variáveis de ambiente faltando geram falhas silenciosas ou de runtime no momento do bootstrap da aplicação.
- Respostas da IA (Gemini) em formato JSON impreciso causam exceções de parsing ao mapear sugestões de WBS/tarefas.

## Decisão

Adotar uma **Estratégia de Validação em 3 Camadas**:

1. **Camada 1 (Bootstrap & Configuração)**: Validação de Variáveis de Ambiente via **Joi** no NestJS `ConfigModule`.
2. **Camada 2 (Contratos de Entrada API)**: Validação de DTOs via `class-validator` e `ValidationPipe` global no NestJS com `transform: true` e `whitelist: true`.
3. **Camada 3 (Persistência & Esquema)**: Validação e regras de integridade nos Schemas do **Mongoose** (enums, required, min/max, subdocumentos) e schemas **Zod** para respostas estruturadas de IA.

## Drivers (por que essa escolha atende aos requisitos)

- **Fail-Fast no Startup**: O servidor backend recusa-se a subir se variáveis críticas como `MONGODB_URI` ou `GEMINI_API_KEY` estiverem ausentes.
- **Sanitização de Payloads HTTP**: Garante que atributos não autorizados sejam descartados (`stripUnknown` / `whitelist`) antes de atingir os controllers.
- **Coerção de Tipos e DTO Transformation**: Transforma automaticamente strings ISO de datas em instâncias `Date` e ObjectIds em instâncias `Types.ObjectId`.
- **Garantia de Integridade de Banco**: Mongoose impede gravações com enums inválidos ou atributos fora dos limites.

## Detalhes de Aplicação no SecondBrain

### 1. Joi para Env Vars (`app.module.ts`)

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    MONGODB_URI: Joi.string().required(),
    PORT: Joi.number().default(3000),
    GEMINI_API_KEY: Joi.string().optional(),
    BODY_LIMIT: Joi.string().default("10mb"),
  }),
});
```

### 2. DTOs com `class-validator` (`src/tasks/dto/`, `src/projects/dto/`)

```typescript
export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
```

### 3. Schemas Mongoose e Zod (`src/tasks/schemas/`, `src/projects/schemas/`)

- Mongoose Schemas utilizam `required: true`, `enum`, e subdocumentos tipados para PERT, EVM e checklist.
- Schemas Zod são utilizados ao parsear retornos em JSON Mode do Gemini API.

## Onde no código

- **Bootstrap de Validação**: [Backend/src/main.ts](../../Backend/src/main.ts)
- **Validação de Variáveis de Ambiente**: [Backend/src/app.module.ts](../../Backend/src/app.module.ts)
- **DTOs de Tarefas**: [Backend/src/tasks/dto/create-task.dto.ts](../../Backend/src/tasks/dto/create-task.dto.ts), [Backend/src/tasks/dto/bulk-create-tasks.dto.ts](../../Backend/src/tasks/dto/bulk-create-tasks.dto.ts)
- **DTOs de Projetos**: [Backend/src/projects/dto/create-project.dto.ts](../../Backend/src/projects/dto/create-project.dto.ts)
- **Schemas de Banco**: [Backend/src/tasks/schemas/task.schema.ts](../../Backend/src/tasks/schemas/task.schema.ts), [Backend/src/projects/schemas/project.schema.ts](../../Backend/src/projects/schemas/project.schema.ts)

## Consequências

### Positivas

- Respostas de erro padronizadas (HTTP 400 Bad Request) com lista detalhada de violações.
- Prevenção contra injeção de atributos indesejados (NoSQL Injection mitigation).
- Código de serviço limpo, focado em regras de negócio e livre de rotinas de `if (!req.body.title)` defensivas.

### Negativas / Trade-offs

- Pequeno overhead computacional na instanciação e validação de DTOs em endpoints de inserção massiva em lote (`/tasks/bulk`).
- Necessidade de manter DTOs sincronizados com os Schemas do Mongoose.

## Validação (Critérios de Aceite)

- Testes unitários com DTOs inválidos disparam erro de validação esperado.
- Tentativa de subir o backend sem `MONGODB_URI` interrompe o processo no bootstrap com mensagem clara de erro do Joi.

## ADRs Relacionadas

- ADR-001: [001-why-nestjs-mongoose.md](001-why-nestjs-mongoose.md)
- ADR-002: [002-module-separation.md](002-module-separation.md)
- ADR-003: [003-gemini-integration.md](003-gemini-integration.md)
