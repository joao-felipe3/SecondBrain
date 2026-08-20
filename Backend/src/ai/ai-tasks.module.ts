import { Module } from '@nestjs/common';
import { ChecklistAiService } from './services/tasks/checklist-ai.service';
import { PertAiService } from './services/tasks/pert-ai.service';
import { SuggestionsAiService } from './services/tasks/suggestions-ai.service';
import { DependencyAiService } from './services/tasks/dependency-ai.service';
import { DraftsAiService } from './services/tasks/drafts-ai.service';
import { GeminiExecutorService } from './services/core/gemini-executor.service';

@Module({
  providers: [
    GeminiExecutorService,
    ChecklistAiService,
    PertAiService,
    SuggestionsAiService,
    DependencyAiService,
    DraftsAiService,
  ],
  exports: [
    ChecklistAiService,
    PertAiService,
    SuggestionsAiService,
    DependencyAiService,
    DraftsAiService,
  ],
})
export class AiTasksModule {}
