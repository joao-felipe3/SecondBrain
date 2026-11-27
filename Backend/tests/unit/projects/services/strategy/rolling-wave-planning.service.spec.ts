import { Types } from 'mongoose';
import { RollingWavePlanningService } from '@src/projects/services/strategy/rolling-wave-planning.service';

const projectId = '507f1f77bcf86cd799439011';
const id = () => new Types.ObjectId().toString();

describe('RollingWavePlanningService.createInitialWaves', () => {
  let service: RollingWavePlanningService;
  let waveModel: any;
  let saved: any[];
  let existingWaves: any[];
  let projectsService: any;
  let wbsService: any;
  let ai: any;

  const leaf = (nodeId: string, name: string, hours: number) => ({
    _id: nodeId,
    name,
    level: 2,
    estimatedHours: hours,
    children: [],
  });

  beforeEach(() => {
    saved = [];
    existingWaves = [];
    waveModel = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockImplementation(() => {
        saved.push(doc);
        return Promise.resolve(doc);
      }),
    }));
    waveModel.find = jest.fn().mockImplementation(() => ({
      sort: () => ({ exec: () => Promise.resolve(saved.length ? saved : existingWaves) }),
    }));
    waveModel.deleteMany = jest.fn().mockReturnValue({ exec: () => Promise.resolve({}) });

    projectsService = {
      getTasksForProject: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    };
    wbsService = {
      getWBS: jest.fn().mockResolvedValue([
        {
          _id: 'root',
          name: 'Chinês',
          level: 1,
          estimatedHours: 100,
          children: [leaf('anki', 'Anki básico', 80), leaf('leitura', 'Leitura', 20)],
        },
      ]),
    };
    ai = { describeSlices: jest.fn().mockResolvedValue(new Map()) };

    service = new RollingWavePlanningService(waveModel, projectsService, wbsService, ai);
  });

  const project = { name: 'Chinês', deadline: new Date(Date.now() + 60 * 86400000) };

  it('fatia os pacotes folha em ondas sem criar micro-tarefas', async () => {
    await service.createInitialWaves(projectId, project, 28);

    const slices = saved.flatMap((w) => w.slices);
    expect(slices.reduce((a: number, s: any) => a + s.hours, 0)).toBe(100);
    expect(slices.filter((s: any) => s.wbsNodeId === 'anki')).toHaveLength(4);
    expect(slices.every((s: any) => s.status === 'planned' && s.taskIds.length === 0)).toBe(true);
    expect(saved.every((w) => w.taskIds.length === 0)).toBe(true);
    expect(saved.map((w) => w.waveNumber)).toEqual(saved.map((_, i) => i + 1));
  });

  it('usa os objetivos da IA e mantém "Parte n/m" onde ela falhou', async () => {
    ai.describeSlices.mockResolvedValue(
      new Map([['anki', ['Cap 1-2', 'Cap 3-4', 'Cap 5-6', 'Revisão']]]),
    );
    await service.createInitialWaves(projectId, project, 28);

    const anki = saved.flatMap((w) => w.slices).filter((s: any) => s.wbsNodeId === 'anki');
    expect(anki.map((s: any) => s.goal)).toEqual(['Cap 1-2', 'Cap 3-4', 'Cap 5-6', 'Revisão']);
    // Só pacotes com 2+ fatias vão para a IA
    const sent = ai.describeSlices.mock.calls[0][0].packages.map((p: any) => p.id);
    expect(sent).toEqual(['anki']);
  });

  it('desconta horas de tarefas já criadas para o pacote', async () => {
    projectsService.getTasksForProject.mockResolvedValue([
      { parentWbsNodeId: 'anki', pomodorosPlanned: 40 }, // 20h
    ]);
    await service.createInitialWaves(projectId, project, 28);

    const anki = saved.flatMap((w) => w.slices).filter((s: any) => s.wbsNodeId === 'anki');
    expect(anki.reduce((a: number, s: any) => a + s.hours, 0)).toBe(60);
  });

  it('replanejar preserva ondas detalhadas e só fatia o restante depois delas', async () => {
    const lockedEnd = new Date(Date.now() + 10 * 86400000);
    lockedEnd.setHours(0, 0, 0, 0); // ondas são criadas à meia-noite
    const locked = {
      _id: id(),
      waveNumber: 1,
      status: 'active',
      startDate: new Date(),
      endDate: lockedEnd,
      taskIds: [],
      slices: [
        { wbsNodeId: 'anki', hours: 20, status: 'detailed' },
        { wbsNodeId: 'anki', hours: 20, status: 'planned' },
      ],
    };
    const replaceable = { _id: id(), waveNumber: 2, status: 'planned', taskIds: [], slices: [] };
    existingWaves = [locked, replaceable];
    // 20h de tarefas da fatia detalhada já existem
    projectsService.getTasksForProject.mockResolvedValue([
      { parentWbsNodeId: 'anki', pomodorosPlanned: 40 },
    ]);

    await service.createInitialWaves(projectId, project, 28);

    expect(waveModel.deleteMany).toHaveBeenCalledWith({ _id: { $in: [replaceable._id] } });
    const anki = saved.flatMap((w) => w.slices).filter((s: any) => s.wbsNodeId === 'anki');
    // 80 − 20 (tarefas) − 20 (fatia planejada na onda preservada) = 40
    expect(anki.reduce((a: number, s: any) => a + s.hours, 0)).toBe(40);
    expect(saved[0].waveNumber).toBe(2);
    expect(saved[0].startDate.getTime()).toBe(lockedEnd.getTime());
  });

  it('não cria ondas quando não sobra nada a planejar', async () => {
    projectsService.getTasksForProject.mockResolvedValue([
      { parentWbsNodeId: 'anki', pomodorosPlanned: 160 },
      { parentWbsNodeId: 'leitura', pomodorosPlanned: 40 },
    ]);
    await service.createInitialWaves(projectId, project, 28);
    expect(saved).toHaveLength(0);
    expect(ai.describeSlices).not.toHaveBeenCalled();
  });
});
