import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class MongooseLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('MongoosePerformance');
  private readonly slowQueryThresholdMs = 100;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const req = context.switchToHttp().getRequest();
    const method = req?.method || 'INTERNAL';
    const url = req?.url || 'HANDLER';

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        if (duration > this.slowQueryThresholdMs) {
          this.logger.warn(
            `⚠️ Slow execution detected on [${method}] ${url} - Took ${duration}ms (Threshold: ${this.slowQueryThresholdMs}ms)`,
          );
        } else {
          this.logger.debug(`⚡ Executed [${method}] ${url} in ${duration}ms`);
        }
      }),
    );
  }
}
