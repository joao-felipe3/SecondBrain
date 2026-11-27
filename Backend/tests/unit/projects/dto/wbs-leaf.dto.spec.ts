import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { AuditLeafDiscrepancyDto, CompleteLeafTasksDto } from '../../../../src/projects/dto/wbs.dto';

/**
 * Mesma configuração do ValidationPipe global (src/main.ts). Com `whitelist: true`, campo sem
 * decorador do class-validator é removido: `leafNode` chegava undefined e a conversão quebrava.
 */
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

function run<T>(metatype: new () => T, body: unknown): Promise<T> {
  const metadata: ArgumentMetadata = { type: 'body', metatype };
  return pipe.transform(body, metadata) as Promise<T>;
}

const leafNode = {
  _id: 'leaf-1',
  name: 'Gramática Intermediária',
  description: 'Estruturas frásicas complexas',
  level: 3,
  estimatedHours: 120,
};

describe('DTOs de folha da WBS (com o ValidationPipe global)', () => {
  it('CompleteLeafTasksDto mantém o leafNode (nó-fatia) e os títulos existentes', async () => {
    const dto = await run(CompleteLeafTasksDto, {
      leafNode,
      nodePath: 'Projeto > Gramática',
      existingTaskNames: ['Revisar vocabulário'],
      missingHours: 6,
    });

    expect(dto.leafNode.name).toBe('Gramática Intermediária');
    expect(dto.existingTaskNames).toEqual(['Revisar vocabulário']);
  });

  it('CompleteLeafTasksDto rejeita requisição sem leafNode', async () => {
    await expect(
      run(CompleteLeafTasksDto, { nodePath: 'Projeto', existingTaskNames: [], missingHours: 2 }),
    ).rejects.toThrow();
  });

  it('AuditLeafDiscrepancyDto mantém o leafNode', async () => {
    const dto = await run(AuditLeafDiscrepancyDto, {
      leafNode,
      nodePath: 'Projeto > Gramática',
      generatedHours: 40,
      tasks: [{ name: 'Revisar vocabulário', pomodorosPlanned: 2 }],
    });

    expect(dto.leafNode).toBeDefined();
    expect(dto.leafNode.name).toBe('Gramática Intermediária');
  });
});
