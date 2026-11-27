import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WaveDetailingService } from '@src/projects/services/strategy/wave-detailing.service';

const projectId = new Types.ObjectId().toString();
const oid = () => new Types.ObjectId();

const makeSlice = (over: any = {}) => ({
  _id: oid(),
  wbsNodeId: 'anki',
  wbsPath: 'Chinês > Anki básico',
  packageName: 'Anki básico',
  sliceIndex: 1,
  sliceCount: 4,
  goal: 'Decks dos capítulos 1 a 3',
  hours: 20,
  status: 'planned',
  taskIds: [],
  ...over,
});

const makeWave = (waveNumber: number, status: string, slices: any[] = []) => {
  const wave: any = {
    _id: oid(),
    waveNumber,
    status,
    slices,
    taskIds: [],
    markModified: jest.fn(),
    save: jest.fn().mockImplementation(() => Promise.resolve(wave)),
  };
  return wave;
};

describe('WaveDetailingService', () => {
  let service: WaveDetailingService;
  let waves: any[];
  let tasks: any[];
  let waveModel: any;
  let taskModel: any;
  let projectsService: any;
  let wbsService: any;

  beforeEach(() => {
    waves = [];
    tasks = [];
    waveModel = {
      find: jest.fn().mockImplementation(() => ({
        sort: () => ({ exec: () => Promise.resolve(waves) }),
        lean: () => ({ exec: () => Promise.resolve(waves) }),
      })),
      findOne: jest.fn().mockImplementation((q) => ({
        exec: () => Promise.resolve(waves.find((w) => String(w._id) === String(q._id)) ?? null),
      })),
    };
    taskModel = {
      find: jest.fn().mockImplementation(() => ({
        lean: () => ({ exec: () => Promise.resolve(tasks) }),
      })),
    };
    projectsService = { findOne: jest.fn().mockResolvedValue({ _id: projectId, name: 'Chinês' }) };
    wbsService = {
      getWBS: jest.fn().mockResolvedValue([
        {
          _id: 'root',
          name: 'Chinês',
          children: [
            {
              _id: 'anki',
              name: 'Anki básico',
              description: 'Memorização com Anki',
              estimatedHours: 80,
              children: [],
            },
          ],
        },
      ]),
      generateTasksForSingleLeaf: jest
        .fn()
        .mockResolvedValue({ tasks: [{ name: 'Criar deck do cap. 4' }], generatedHours: 2 }),
    };
    service = new WaveDetailingService(waveModel, taskModel, projectsService, wbsService);
  });

  describe('horizonte', () => {
    it('onda ativa e a seguinte; sem ativa, a primeira não concluída', async () => {
      const w1 = makeWave(1, 'completed');
      const w2 = makeWave(2, 'planned');
      const w3 = makeWave(3, 'planned');
      const w4 = makeWave(4, 'planned');
      waves = [w1, w2, w3, w4];
      expect(await service.getHorizonWaveIds(projectId)).toEqual([String(w2._id), String(w3._id)]);

      w3.status = 'active';
      expect(await service.getHorizonWaveIds(projectId)).toEqual([String(w3._id), String(w4._id)]);
    });

    it('recusa detalhar onda fora do horizonte (409)', async () => {
      const far = makeWave(3, 'planned', [makeSlice()]);
      waves = [makeWave(1, 'active'), makeWave(2, 'planned'), far];
      await expect(service.getDetailItems(projectId, String(far._id))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('itens e nó-fatia', () => {
    it('só fatias planejadas; o nó tem as horas da fatia e o escopo + o que já foi coberto', async () => {
      const previous = makeSlice({ sliceIndex: 1, goal: 'Decks cap. 1-3', status: 'detailed' });
      const current = makeSlice({ sliceIndex: 2, goal: 'Decks cap. 4-6' });
      const w1 = makeWave(1, 'active', [previous, current]);
      waves = [w1];

      const items = await service.getDetailItems(projectId, String(w1._id));

      expect(items).toHaveLength(1);
      expect(items[0].sliceId).toBe(String(current._id));
      expect(items[0].node.estimatedHours).toBe(20);
      expect(items[0].node._id).toBe('anki');
      expect(items[0].node.description).toContain('Memorização com Anki');
      expect(items[0].node.description).toContain('Escopo desta fatia (2/4): Decks cap. 4-6');
      expect(items[0].node.description).toContain(
        'Já coberto nas fatias anteriores (não repetir): Decks cap. 1-3',
      );
    });
  });

  describe('generateSliceTasks', () => {
    it('gera com os títulos existentes do pacote como proibidos e marca onda/fatia nas tarefas', async () => {
      const slice = makeSlice({ sliceIndex: 2 });
      const w1 = makeWave(1, 'active', [slice]);
      waves = [w1];
      tasks = [{ name: 'Criar deck do cap. 1' }, { name: 'Revisar cap. 2' }];

      const res = await service.generateSliceTasks(projectId, String(w1._id), String(slice._id), {
        modelOverride: 'gemini-3.8-flash',
      });

      const call = wbsService.generateTasksForSingleLeaf.mock.calls[0][0];
      expect(call.avoidTaskTitles).toEqual(['Criar deck do cap. 1', 'Revisar cap. 2']);
      expect(call.saveTasks).toBe(false);
      expect(call.preferences.modelOverride).toBe('gemini-3.8-flash');
      expect(call.leafNode.estimatedHours).toBe(20);
      expect(res.tasks[0]).toMatchObject({ waveId: String(w1._id), waveSliceId: String(slice._id) });
    });
  });

  describe('commitTasks', () => {
    it('vincula as tarefas salvas às fatias, marca como detalhadas e aplica re-baseline', async () => {
      const s1 = makeSlice();
      const s2 = makeSlice({ sliceIndex: 2 });
      const w1 = makeWave(1, 'active', [s1, s2]);
      waves = [w1];
      const t1 = oid();
      const t2 = oid();
      tasks = [
        { _id: t1, waveSliceId: String(s1._id) },
        { _id: t2, waveSliceId: String(s1._id) },
      ];

      const saved = await service.commitTasks(projectId, String(w1._id), [
        { sliceId: String(s1._id), hours: 23.3 },
      ]);

      expect(s1.status).toBe('detailed');
      expect(s1.taskIds).toEqual([t1, t2]);
      expect(s1.hours).toBe(23.5);
      expect(s2.status).toBe('planned');
      expect(saved.taskIds.map(String)).toEqual([String(t1), String(t2)]);
      expect(w1.markModified).toHaveBeenCalledWith('slices');
    });
  });
});
