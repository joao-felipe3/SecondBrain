import { TaskConversionService } from '../../../../../src/projects/services/wbs/conversion/task-conversion.service';

describe('TaskConversionService', () => {
  const service = new TaskConversionService();

  it('converte rascunhos em tarefas ligadas ao pacote WBS', async () => {
    const tasks = await service.convertDraftsToTasks(
      [{ name: 'Criar deck do capítulo 1', pomodorosPlanned: 2 } as any],
      {
        wbsNode: { _id: 'anki', name: 'Anki', level: 2, estimatedHours: 20 },
        path: 'Chinês > Anki',
      },
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      name: 'Criar deck do capítulo 1',
      parentWbsNodeId: 'anki',
      wbsPath: 'Chinês > Anki',
      pomodorosPlanned: 2,
    });
  });
});
