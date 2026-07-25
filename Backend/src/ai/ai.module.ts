import { Module, Global } from '@nestjs/common';
import { GeminiService } from './services/core/gemini.service';
import { GeminiExecutorService } from './services/core/gemini-executor.service';
import { ChecklistAiService } from './services/tasks/checklist-ai.service';
import { PertAiService } from './services/tasks/pert-ai.service';
import { SuggestionsAiService } from './services/tasks/suggestions-ai.service';
import { DependencyAiService } from './services/tasks/dependency-ai.service';
import { PromptBuilderService } from './services/projects/prompt-builder.service';
import { DraftsAiService } from './services/tasks/drafts-ai.service';
import { RollingWaveAIService } from './services/projects/rolling-wave-ai.service';
import { WbsAiService } from './services/projects/wbs-ai.service';
import { AiWikiService } from './services/wiki/ai-wiki.service';
import { AiWikiController } from './controllers/wiki/ai-wiki.controller';

@Global()
@Module({
  controllers: [AiWikiController],
  providers: [
    GeminiService,
    GeminiExecutorService,
    ChecklistAiService,
    PertAiService,
    SuggestionsAiService,
    DependencyAiService,
    PromptBuilderService,
    DraftsAiService,
    RollingWaveAIService,
    WbsAiService,
    AiWikiService,
  ],
  exports: [
    GeminiService,
    GeminiExecutorService,
    ChecklistAiService,
    PertAiService,
    SuggestionsAiService,
    DependencyAiService,
    PromptBuilderService,
    DraftsAiService,
    RollingWaveAIService,
    WbsAiService,
    AiWikiService,
  ],
})
export class AIModule {}
