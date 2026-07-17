import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { PromptBuilderService } from './prompt-builder.service';
import { DraftsAiService } from './drafts-ai.service';
import { RollingWaveAIService } from './rolling-wave-ai.service';
import { WbsAiService } from './wbs-ai.service';

@Global()
@Module({
  providers: [GeminiService, PromptBuilderService, DraftsAiService, RollingWaveAIService, WbsAiService],
  exports: [GeminiService, PromptBuilderService, DraftsAiService, RollingWaveAIService, WbsAiService],
})
export class AIModule {}
