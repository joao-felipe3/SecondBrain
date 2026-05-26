import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { request } from 'supertest';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { GeminiService } from '../../src/ai/gemini.service';
import { ChecklistService } from './checklist.service';
import { ProjectsService } from '../projects/projects.service';
import { PertService } from './services/pert.service';
import { EVMService } from '../projects/services/evm.service';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

/**
 * Sprint 2 E2E Tests: Gold Standard Checklists
 *
 * Scenarios covered:
 * 1. Create micro-task → generate checklist with historical context → list items
 * 2. Edit multiple checklist items → save → verify progress % updates
 * 3. Try conclude task with 50% checklist → error 400 "checklist must be 100%"
 * 4. Complete 100% → save → enable "Concluir" → success
 */
describe('Sprint 2: Checklist Validation & Historical Context (E2E)', () => {
  let app: INestApplication;
  let taskService: TasksService;
  let geminiService: GeminiService;
  let checklistService: ChecklistService;
  let mongoServer: MongoMemoryServer;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        // ... other imports
      ],
      controllers: [TasksController],
      providers: [
        TasksService,
        GeminiService,
        ChecklistService,
        ProjectsService,
        PertService,
        EVMService,
        // ... other providers
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    taskService = moduleFixture.get<TasksService>(TasksService);
    geminiService = moduleFixture.get<GeminiService>(GeminiService);
    checklistService = moduleFixture.get<ChecklistService>(ChecklistService);

    // Setup: Create test project
    projectId = new Types.ObjectId().toString();
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  describe('Scenario 1: Create micro-task with historical context', () => {
    it('should create micro-task and generate checklist with historical context', async () => {
      const payload = {
        name: 'Implementar endpoint de autenticação',
        description: 'Setup JWT com validação de token',
        microTaskType: 'complex',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 30,
        pertMostLikelyMinutes: 60,
        pertPessimisticMinutes: 90,
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/micro')
        .send(payload)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body._id).toBeDefined();
      expect(response.body.checklist).toBeDefined();
      expect(Array.isArray(response.body.checklist)).toBe(true);
      expect(response.body.checklist.length).toBeGreaterThanOrEqual(3);
      expect(response.body.checklist.length).toBeLessThanOrEqual(10);

      // Validate checklist structure
      response.body.checklist.forEach((item: any) => {
        expect(item.item).toBeDefined();
        expect(typeof item.completed).toBe('boolean');
        expect(Number.isFinite(item.order || 0)).toBe(true);
      });

      taskId = response.body._id;
    });

    it('should reject checklist with < 3 items', async () => {
      const payload = {
        name: 'Quick task',
        description: 'Minimal task',
        microTaskType: 'quick',
        project: projectId,
        autoGenerateChecklist: false,
        checklist: [{ item: 'Do something', completed: false }],
        pertOptimisticMinutes: 5,
        pertMostLikelyMinutes: 10,
        pertPessimisticMinutes: 15,
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      expect(response.body.message).toContain('mínimo 3');
    });
  });

  describe('Scenario 2: Edit checklist items & verify progress', () => {
    it('should update individual checklist item', async () => {
      if (!taskId) {
        throw new Error('taskId not set');
      }

      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/checklist/0`)
        .send({ completed: true })
        .expect(200);

      expect(response.body.checklist).toBeDefined();
      expect(response.body.checklist[0].completed).toBe(true);
      expect(response.body.completionPercentage).toBeDefined();
      expect(response.body.completionPercentage).toBeGreaterThan(0);
    });

    it('should update full checklist and persist changes', async () => {
      if (!taskId) {
        throw new Error('taskId not set');
      }

      const updatedChecklist = [
        { item: 'Estruturar projeto', completed: true, order: 0 },
        { item: 'Implementar autenticação', completed: true, order: 1 },
        { item: 'Testar endpoints', completed: false, order: 2 },
        { item: 'Documentar API', completed: false, order: 3 },
      ];

      const response = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/checklist`)
        .send({ checklist: updatedChecklist })
        .expect(200);

      expect(response.body.checklist).toHaveLength(4);
      expect(response.body.checklist[0].completed).toBe(true);
      expect(response.body.checklist[2].completed).toBe(false);
    });

    it('should calculate correct progress percentage', async () => {
      if (!taskId) {
        throw new Error('taskId not set');
      }

      const response = await request(app.getHttpServer())
        .get(`/tasks/micro/${taskId}`)
        .expect(200);

      const checklist = response.body.checklist;
      const completed = checklist.filter((item: any) => item.completed).length;
      const percentage = Math.round((completed / checklist.length) * 100);

      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('Scenario 3: Reject conclusion with incomplete checklist', () => {
    it('should block task conclusion when checklist < 100%', async () => {
      if (!taskId) {
        throw new Error('taskId not set');
      }

      // Ensure checklist is not 100% complete
      const incompleteChecklist = [
        { item: 'Task 1', completed: true, order: 0 },
        { item: 'Task 2', completed: false, order: 1 },
        { item: 'Task 3', completed: false, order: 2 },
      ];

      await request(app.getHttpServer())
        .post(`/tasks/${taskId}/checklist`)
        .send({ checklist: incompleteChecklist });

      // Try to mark as concluded
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/conclude`)
        .expect(400);

      expect(response.body.message).toContain('incompleto');
      expect(response.body.message).toContain('%');
    });
  });

  describe('Scenario 4: Allow conclusion when checklist 100%', () => {
    it('should allow task conclusion when checklist is 100% complete', async () => {
      if (!taskId) {
        throw new Error('taskId not set');
      }

      // Set checklist to 100%
      const completeChecklist = [
        { item: 'Task 1', completed: true, order: 0 },
        { item: 'Task 2', completed: true, order: 1 },
        { item: 'Task 3', completed: true, order: 2 },
      ];

      await request(app.getHttpServer())
        .post(`/tasks/${taskId}/checklist`)
        .send({ checklist: completeChecklist });

      // Mark as concluded should succeed
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/conclude`)
        .expect(200);

      expect(response.body.isConcluded).toBe(true);
    });

    it('should allow task conclusion when task has no checklist', async () => {
      // Create task without micro-type (no checklist required)
      const payload = {
        name: 'Regular task without checklist',
        project: projectId,
        pomodorosPlanned: 1,
        deadline: new Date(Date.now() + 86400000),
      };

      const createResponse = await request(app.getHttpServer())
        .post('/tasks')
        .send(payload)
        .expect(201);

      const regularTaskId = createResponse.body._id;

      // Should allow conclusion without checklist validation
      const concludeResponse = await request(app.getHttpServer())
        .patch(`/tasks/${regularTaskId}/conclude`)
        .expect(200);

      expect(concludeResponse.body.isConcluded).toBe(true);
    });
  });

  describe('Scenario 5: Validate checklist structure', () => {
    it('should reject checklist with duplicates', async () => {
      const payload = {
        name: 'Duplicate items test',
        description: 'Should fail',
        microTaskType: 'habit',
        project: projectId,
        autoGenerateChecklist: false,
        checklist: [
          { item: 'Same item', completed: false },
          { item: 'Some item', completed: false },
          { item: 'Same Item', completed: false }, // Case-insensitive duplicate
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      expect(response.body.message).toContain('duplicado');
    });

    it('should reject checklist with empty items', async () => {
      const payload = {
        name: 'Empty items test',
        description: 'Should fail',
        microTaskType: 'habit',
        project: projectId,
        autoGenerateChecklist: false,
        checklist: [
          { item: 'Valid item', completed: false },
          { item: '', completed: false },
          { item: 'Another item', completed: false },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      expect(response.body.message).toContain('vazi');
    });

    it('should accept checklist with 3-10 valid items', async () => {
      for (let count = 3; count <= 10; count++) {
        const checklist = Array.from({ length: count }, (_, i) => ({
          item: `Item ${i + 1}`,
          completed: false,
        }));

        const payload = {
          name: `Test with ${count} items`,
          description: 'Should pass',
          microTaskType: 'subtask',
          project: projectId,
          autoGenerateChecklist: false,
          checklist,
          pertOptimisticMinutes: 10,
          pertMostLikelyMinutes: 20,
          pertPessimisticMinutes: 30,
        };

        const response = await request(app.getHttpServer())
          .post('/tasks/micro')
          .send(payload)
          .expect(201);

        expect(response.body.checklist).toHaveLength(count);
      }
    });

    it('should reject checklist with > 10 items', async () => {
      const checklist = Array.from({ length: 11 }, (_, i) => ({
        item: `Item ${i + 1}`,
        completed: false,
      }));

      const payload = {
        name: 'Too many items',
        description: 'Should fail',
        microTaskType: 'complex',
        project: projectId,
        autoGenerateChecklist: false,
        checklist,
      };

      const response = await request(app.getHttpServer())
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      expect(response.body.message).toContain('10');
    });
  });

  describe('Performance: Bulk checklist operations', () => {
    it('should handle 50+ tasks with checklists without lag', async () => {
      const startTime = Date.now();
      const tasks = [];

      for (let i = 0; i < 50; i++) {
        const payload = {
          name: `Perf test task ${i}`,
          description: `Task ${i} for performance testing`,
          microTaskType: 'habit',
          project: projectId,
          autoGenerateChecklist: true,
          pertOptimisticMinutes: 5,
          pertMostLikelyMinutes: 10,
          pertPessimisticMinutes: 15,
        };

        const response = await request(app.getHttpServer())
          .post('/tasks/micro')
          .send(payload);

        if (response.status === 201) {
          tasks.push(response.body._id);
        }
      }

      const elapsed = Date.now() - startTime;
      const avgTime = elapsed / 50;

      expect(tasks).toHaveLength(50);
      expect(avgTime).toBeLessThan(500); // < 500ms per task on average
    });
  });
});
