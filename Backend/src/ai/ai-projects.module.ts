import { Module } from '@nestjs/common';
import { PromptBuilderService } from './services/projects/prompt-builder.service';
import { RollingWaveAIService } from './services/projects/rolling-wave-ai.service';
import { WbsAiService } from './services/projects/wbs-ai.service';
import { AiWikiService } from './services/wiki/ai-wiki.service';
import { GeminiExecutorService } from './services/core/gemini-executor.service';

@Module({
  providers: [
    GeminiExecutorService,
    PromptBuilderService,
    RollingWaveAIService,
    WbsAiService,
    AiWikiService,
  ],
  exports: [PromptBuilderService, RollingWaveAIService, WbsAiService, AiWikiService],
})
export class AiProjectsModule {}
