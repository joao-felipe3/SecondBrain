# ADR-009: Observabilidade de Banco de Dados e Logging de Queries Lentas (Mongoose Interceptor)

## Contexto

Com o crescimento das operações do **SecondBrain** — inserção de tarefas em lote (`/tasks/bulk`), conversão automatizada de WBS para tarefas, recálculos de PERT/CPM e agregações de EVM —, consultas ineficientes ao MongoDB poderiam degradar a latência do sistema sem alertas visíveis.

Desafios:

- Identificar queries sem índice adequado ou com alto tempo de execução (>100ms).
- Permitir depuração detalhada em ambiente de desenvolvimento sem poluir os logs de produção.

## Decisão

Implementar um sistema de **Observabilidade e Slow Query Logging NATIVO** no backend NestJS:

1. **`MongooseLoggerInterceptor`**: Interceptor NestJS customizado em `Backend/src/common/interceptors/mongoose-logger.interceptor.ts` que monitora a duração das execuções de banco de dados e emite um alerta (`Logger.warn`) para qualquer consulta com tempo de execução superior a **100ms**.
2. **Suporte a `MONGOOSE_DEBUG=true`**: Flag de ambiente configurável para ativar o modo de debug nativo do Mongoose em ambientes de desenvolvimento/staging, exibindo os comandos Mongo brutos e tempos de resposta.

## Drivers (por que essa escolha atende aos requisitos)

- **Identificação Precoce de Gargalos**: Detecta falta de índices secundários no MongoDB (ex: queries buscando por `projectId` ou `parentWbsNodeId`) antes que afetem a produção.
- **Zero Sobrecarga Externa**: Funciona nativamente no NestJS/Mongoose sem necessidade de agentes de APM pesados de terceiros na fase atual.

## Detalhes de Aplicação no SecondBrain

### `MongooseLoggerInterceptor`

```typescript
@Injectable()
export class MongooseLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger("MongooseQuery");

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        const delay = Date.now() - now;
        if (delay > 100) {
          this.logger.warn(`SLOW QUERY DETECTED: Execution took ${delay}ms`);
        }
      }),
    );
  }
}
```

## Onde no código

- **Interceptor de Queries Lentas**: [Backend/src/common/interceptors/mongoose-logger.interceptor.ts](../../Backend/src/common/interceptors/mongoose-logger.interceptor.ts)
- **Configuração Mongoose no App Module**: [Backend/src/app.module.ts](../../Backend/src/app.module.ts)

## Consequências

### Positivas

- Rastreabilidade clara e imediata do desempenho de consultas no console de logs.
- Facilidade para identificar gargalos ao rodar chamadas pesadas de IA/WBS.

### Negativas / Trade-offs

- Requer monitoramento contínuo das saídas de log para ajustar índices do Mongoose conforme o volume de dados crescer.

## ADRs Relacionadas

- ADR-001: [001-why-nestjs-mongoose.md](001-why-nestjs-mongoose.md)
- ADR-008: [008-cicd-quality-guardrails.md](008-cicd-quality-guardrails.md)
