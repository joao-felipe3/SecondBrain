import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiWikiService } from '../../services/wiki/ai-wiki.service';
import { WikiQueryDto, WikiQueryResponseDto } from '../../dto/wiki-query.dto';

@ApiTags('ai-wiki')
@Controller('ai/wiki-query')
export class AiWikiController {
  constructor(private readonly aiWikiService: AiWikiService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consulta semântica e Graph RAG na documentação e código do repositório' })
  @ApiResponse({ status: 200, description: 'Resposta sintetizada com fontes e subgrafo' })
  async queryWiki(@Body() dto: WikiQueryDto): Promise<WikiQueryResponseDto> {
    return this.aiWikiService.queryWiki(dto);
  }
}
