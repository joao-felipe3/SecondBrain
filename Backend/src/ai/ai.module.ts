import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { PromptBuilderService } from './prompt-builder.service';

@Global()
@Module({
  providers: [GeminiService, PromptBuilderService],
  exports: [GeminiService, PromptBuilderService],
})
export class AIModule {}
