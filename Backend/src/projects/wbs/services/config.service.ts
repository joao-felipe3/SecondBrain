import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly nestConfig: NestConfigService) {}

  getNumericEnv(key: string, defaultValue: number = 0): number {
    const value = this.nestConfig.get<string>(key);
    if (!value) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  getStringEnv(key: string, defaultValue: string = ''): string {
    const value = this.nestConfig.get<string>(key);
    return value?.trim() || defaultValue;
  }

  getBooleanEnv(key: string, defaultValue: boolean = false): boolean {
    const value = this.nestConfig.get<string>(key);
    if (!value) return defaultValue;
    return /^(true|1|yes|on)$/i.test(value);
  }

  getWbsGenerationModelOverride(): string | undefined {
    return (
      this.getStringEnv('WBS_GENERATION_MODEL_OVERRIDE', '').trim() || undefined
    );
  }

  getMaxPerCall(): number {
    return this.getNumericEnv('WBS_MAX_PER_CALL', 24);
  }

  getSliceConcurrency(): number {
    return this.getNumericEnv('WBS_SLICE_CONCURRENCY', 4);
  }

  getMaxOutputTokens(): number {
    return this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
  }

  getMaxOutputTokensRetry(): number {
    return this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);
  }

  // ============ Cache Configuration ============

  getRedisUrl(): string | undefined {
    const url = this.getStringEnv('REDIS_URL', '');
    if (url) return url;

    const host = this.getStringEnv('REDIS_HOST', '');
    const port = this.getStringEnv('REDIS_PORT', '');
    if (host && port) return `redis://${host}:${port}`;

    return undefined;
  }

  getCacheTtlSeconds(): number {
    return this.getNumericEnv('CACHE_TTL_SECONDS', 86400);
  }

  getCacheBackendName(): 'redis' | 'memory' {
    return this.getRedisUrl() ? 'redis' : 'memory';
  }

  // ============ WBS Sizing Constants ============

  getMicroTaskMinMinutes(): number {
    return this.getNumericEnv('WBS_MICRO_TASK_MIN_MINUTES', 15);
  }

  getMicroTaskMaxMinutes(): number {
    return this.getNumericEnv('WBS_MICRO_TASK_MAX_MINUTES', 480);
  }

  getMilestoneEveryMinutes(): number {
    return this.getNumericEnv('WBS_MILESTONE_EVERY_MINUTES', 300);
  }

  getMilestoneRequiredMinMinutes(): number {
    return this.getNumericEnv('WBS_MILESTONE_REQUIRED_MIN_MINUTES', 240);
  }

  getDefaultPomodoros(): number {
    return this.getNumericEnv('WBS_DEFAULT_POMODOROS', 3);
  }

  getMaxPomodoros(): number {
    return this.getNumericEnv('WBS_MAX_POMODOROS', 6);
  }

  // ============ Validation Rules ============

  getMinEleitorsPercent(): number {
    return this.getNumericEnv('WBS_MIN_ELEITOR_PERCENT', 8);
  }

  getMaxEleitorsPercent(): number {
    return this.getNumericEnv('WBS_MAX_ELEITOR_PERCENT', 80);
  }

  getMaxChildrenWarning(): number {
    return this.getNumericEnv('WBS_MAX_CHILDREN_WARNING', 8);
  }

  // ============ Debug & Logging Flags ============

  isTimingDebugEnabled(): boolean {
    return (
      this.getBooleanEnv('WBS_DEBUG_TIMING') ||
      this.getBooleanEnv('DEBUG_TIMING', false)
    );
  }

  isCacheDebugEnabled(): boolean {
    return (
      this.getBooleanEnv('WBS_DEBUG_CACHE') ||
      this.getBooleanEnv('DEBUG_CACHE', false)
    );
  }

  isVerboseTaskLogsEnabled(): boolean {
    return (
      this.getBooleanEnv('WBS_VERBOSE_TASK_LOGS') ||
      this.getBooleanEnv('VERBOSE', false)
    );
  }

  isValidationDebugEnabled(): boolean {
    return (
      this.getBooleanEnv('WBS_DEBUG_VALIDATION') ||
      this.getBooleanEnv('DEBUG_VALIDATION', false)
    );
  }

  isLlmDebugEnabled(): boolean {
    return (
      this.getBooleanEnv('WBS_DEBUG_LLM') ||
      this.getBooleanEnv('DEBUG_LLM', false)
    );
  }

  // ============ Utility Methods ============

  getNowIso(): string {
    return new Date().toISOString();
  }

  logIfTimingDebug(message: string, data?: any): void {
    if (this.isTimingDebugEnabled()) {
      const ts = this.getNowIso();
      const output = data ? { ts, message, ...data } : { ts, message };

      console.log('[WBS][timing]', output);
    }
  }

  logIfCacheDebug(message: string, data?: any): void {
    if (this.isCacheDebugEnabled()) {
      const ts = this.getNowIso();
      const output = data ? { ts, message, ...data } : { ts, message };

      console.log('[WBS][cache]', output);
    }
  }

  logIfVerboseTaskLogs(message: string, data?: any): void {
    if (this.isVerboseTaskLogsEnabled()) {
      const ts = this.getNowIso();
      const output = data ? { ts, message, ...data } : { ts, message };

      console.log('[WBS][verbose]', output);
    }
  }

  // ============ Summary/Debug Info ============

  getSummary(): any {
    return {
      generation: {
        modelOverride: this.getWbsGenerationModelOverride() || 'default',
        maxPerCall: this.getMaxPerCall(),
        sliceConcurrency: this.getSliceConcurrency(),
        maxOutputTokens: this.getMaxOutputTokens(),
        maxOutputTokensRetry: this.getMaxOutputTokensRetry(),
      },
      cache: {
        backend: this.getCacheBackendName(),
        ttlSeconds: this.getCacheTtlSeconds(),
        redisUrl: this.getRedisUrl() ? '(configured)' : 'not configured',
      },
      sizing: {
        microTaskMinMinutes: this.getMicroTaskMinMinutes(),
        microTaskMaxMinutes: this.getMicroTaskMaxMinutes(),
        milestoneEveryMinutes: this.getMilestoneEveryMinutes(),
        milestoneRequiredMinMinutes: this.getMilestoneRequiredMinMinutes(),
        defaultPomodoros: this.getDefaultPomodoros(),
        maxPomodoros: this.getMaxPomodoros(),
      },
      validation: {
        minEleitorsPercent: this.getMinEleitorsPercent(),
        maxEleitorsPercent: this.getMaxEleitorsPercent(),
        maxChildrenWarning: this.getMaxChildrenWarning(),
      },
      debug: {
        timingDebug: this.isTimingDebugEnabled(),
        cacheDebug: this.isCacheDebugEnabled(),
        verboseTaskLogs: this.isVerboseTaskLogsEnabled(),
        validationDebug: this.isValidationDebugEnabled(),
        llmDebug: this.isLlmDebugEnabled(),
      },
    };
  }
}
