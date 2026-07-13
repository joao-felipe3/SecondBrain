import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { PromptBuilderService } from './prompt-builder.service';
import { DraftsAiService } from './drafts-ai.service';

@Global()
@Module({
  providers: [GeminiService, PromptBuilderService, DraftsAiService],
  exports: [GeminiService, PromptBuilderService, DraftsAiService],
})
export class AIModule {}
