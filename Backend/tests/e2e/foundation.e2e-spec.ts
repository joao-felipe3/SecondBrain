import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { TasksController } from '../../src/tasks/tasks.controller';
import { TasksService } from '../../src/tasks/tasks.service';
import { GeminiService } from '../../src/ai/services/core/gemini.service';
import { ProjectsService } from '../../src/projects/projects.service';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

interface ChecklistItemResponse {
  item: string;
  completed: boolean;
  order?: number;
}

interface TaskResponse {
  _id?: string;
  name?: string;
  description?: string;
  microTaskType?: string;
  project?: string;
  checklist?: ChecklistItemResponse[];
  pertOptimisticMinutes?: number;
  pertMostLikelyMinutes?: number;
  pertPessimisticMinutes?: number;
  pertExpectedMinutes?: number;
  pertVariance?: number;
  message?: string;
}

/**
 * Sprint 1 E2E Tests: Foundation Backend + Schema
 *
 * SETUP REQUIRED:
 * Install mongodb-memory-server for in-memory MongoDB testing:
 * $ npm install --save-dev mongodb-memory-server
 *
 * Run tests with:
 * $ npm run test:e2e
 *
 * Scenarios covered:
 * 1. Create micro-task with valid PERT → checklist auto-generated
 * 2. Reject micro-task with invalid PERT (optimistic >= likely)
 * 3. Generate and persist checklist → retrieve and verify structure
 * 4. Bulk insert 100 micro-tasks + measure performance
 */
describe('Sprint 1: Foundation Backend + Schema (E2E)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let projectId: string;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongoUri)],
      controllers: [TasksController],
      providers: [TasksService, GeminiService, ProjectsService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Setup: Create test project
    projectId = new Types.ObjectId().toString();
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  describe('Scenario 1: Create micro-task with valid PERT', () => {
    it('should create micro-task with auto-generated checklist', async () => {
      const payload = {
        name: 'Implementar middleware de autenticação',
        description: 'Setup JWT validation com refresh tokens',
        microTaskType: 'complex',
        project: projectId,
        pomodorosPlanned: 3,
        deadline: new Date(Date.now() + 86400000 * 3),
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 30,
        pertMostLikelyMinutes: 60,
        pertPessimisticMinutes: 120,
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(201);

      const body = response.body as TaskResponse;

      // Validate basic structure
      expect(body).toBeDefined();
      expect(body._id).toBeDefined();
      expect(body.name).toBe(payload.name);
      expect(body.microTaskType).toBe('complex');

      // Validate PERT calculation
      expect(body.pertOptimisticMinutes).toBe(30);
      expect(body.pertMostLikelyMinutes).toBe(60);
      expect(body.pertPessimisticMinutes).toBe(120);
      expect(body.pertExpectedMinutes).toBeDefined();
      expect(body.pertVariance).toBeDefined();

      // Validate checklist auto-generation
      expect(body.checklist).toBeDefined();
      expect(Array.isArray(body.checklist)).toBe(true);

      const checklist = body.checklist ?? [];
      expect(checklist.length).toBeGreaterThanOrEqual(3);
      expect(checklist.length).toBeLessThanOrEqual(10);

      // Validate checklist item structure
      checklist.forEach((item: ChecklistItemResponse, index: number) => {
        expect(item).toHaveProperty('item');
        expect(item).toHaveProperty('completed');
        expect(item).toHaveProperty('order');
        expect(typeof item.item).toBe('string');
        expect(item.item.length).toBeGreaterThan(0);
        expect(typeof item.completed).toBe('boolean');
        expect(item.completed).toBe(false);
        expect(item.order).toBe(index);
      });

      // Validate PERT calculation: TE = (O + 4M + P) / 6
      const expectedTE = (30 + 4 * 60 + 120) / 6;
      expect(body.pertExpectedMinutes).toBe(Math.round(expectedTE));
    });
  });

  describe('Scenario 2: Reject micro-task with invalid PERT', () => {
    it('should reject when optimistic >= likely', async () => {
      const payload = {
        name: 'Invalid PERT test 1',
        description: 'optimistic >= likely should fail',
        microTaskType: 'subtask',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 60,
        pertMostLikelyMinutes: 60,
        pertPessimisticMinutes: 120,
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      const body = response.body as TaskResponse;
      expect(body.message).toContain('PERT inválido');
      expect(body.message).toContain('optimistic');
    });

    it('should reject when likely >= pessimistic', async () => {
      const payload = {
        name: 'Invalid PERT test 2',
        description: 'likely >= pessimistic should fail',
        microTaskType: 'habit',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 5,
        pertMostLikelyMinutes: 20,
        pertPessimisticMinutes: 20,
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      const body = response.body as TaskResponse;
      expect(body.message).toContain('PERT inválido');
    });

    it('should reject when any PERT value <= 0', async () => {
      const payload = {
        name: 'Invalid PERT test 3',
        description: 'negative PERT should fail',
        microTaskType: 'quick',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: -5,
        pertMostLikelyMinutes: 10,
        pertPessimisticMinutes: 20,
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      const body = response.body as TaskResponse;
      expect(body.message).toContain('PERT');
    });

    it('should reject when only partial PERT provided', async () => {
      const payload = {
        name: 'Partial PERT test',
        description: 'only some PERT fields provided',
        microTaskType: 'habit',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 5,
        pertMostLikelyMinutes: 10,
        // pessimistic missing
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(400);

      const body = response.body as TaskResponse;
      expect(body.message).toContain('PERT');
    });
  });

  describe('Scenario 3: Generate and persist checklist', () => {
    it('should retrieve micro-task with checklist intact', async () => {
      // Create task
      const createPayload = {
        name: 'Persistência de checklist test',
        description: 'Verify checklist persists in DB',
        microTaskType: 'complex',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 20,
        pertMostLikelyMinutes: 40,
        pertPessimisticMinutes: 80,
      };

      const createResponse = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(createPayload)
        .expect(201);

      const createBody = createResponse.body as TaskResponse;
      const taskId = createBody._id || '';
      const originalChecklist = createBody.checklist || [];

      // Retrieve task
      const getResponse = await request(app.getHttpServer() as App)
        .get(`/tasks/micro/${taskId}`)
        .expect(200);

      const getBody = getResponse.body as TaskResponse;
      const getChecklist = getBody.checklist || [];

      // Verify checklist persisted
      expect(getBody.checklist).toBeDefined();
      expect(getChecklist).toHaveLength(originalChecklist.length);

      // Item-by-item validation
      getChecklist.forEach((item: ChecklistItemResponse, index: number) => {
        expect(item.item).toBe(originalChecklist[index]?.item);
        expect(item.completed).toBe(false);
        expect(item.order).toBe(index);
      });
    });

    it('should update checklist and persist changes', async () => {
      // Create task
      const createPayload = {
        name: 'Checklist update test',
        description: 'Test checklist modification',
        microTaskType: 'habit',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 5,
        pertMostLikelyMinutes: 10,
        pertPessimisticMinutes: 20,
      };

      const createResponse = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(createPayload)
        .expect(201);

      const createBody = createResponse.body as TaskResponse;
      const taskId = createBody._id || '';

      // Update checklist
      const updatedChecklist = [
        { item: 'Executar hábito', completed: true, order: 0 },
        { item: 'Registrar resultado', completed: false, order: 1 },
        { item: 'Refletir sobre resultado', completed: false, order: 2 },
      ];

      const updateResponse = await request(app.getHttpServer() as App)
        .post(`/tasks/${taskId}/checklist`)
        .send({ checklist: updatedChecklist })
        .expect(200);

      const updateBody = updateResponse.body as TaskResponse;
      const updateChecklist = updateBody.checklist || [];

      // Verify update response
      expect(updateChecklist).toHaveLength(3);
      expect(updateChecklist[0]?.completed).toBe(true);

      // Verify persistence: retrieve again
      const getResponse = await request(app.getHttpServer() as App)
        .get(`/tasks/micro/${taskId}`)
        .expect(200);

      const getBody = getResponse.body as TaskResponse;
      const getChecklist = getBody.checklist || [];

      expect(getChecklist[0]?.completed).toBe(true);
      expect(getChecklist[1]?.completed).toBe(false);
    });
  });

  describe('Scenario 4: Performance test - Bulk insert 100 micro-tasks', () => {
    it('should insert 100 micro-tasks efficiently', async () => {
      const startTime = Date.now();
      const bulkPayload = {
        tasks: Array.from({ length: 100 }, (_, i) => ({
          name: `Performance test task ${i + 1}`,
          description: `Bulk insert performance test task number ${i + 1}`,
          microTaskType: ['subtask', 'habit', 'quick', 'complex'][i % 4],
          project: projectId,
          pomodorosPlanned: 1,
          deadline: new Date(Date.now() + 86400000),
          autoGenerateChecklist: true,
          pertOptimisticMinutes: 5 + (i % 20),
          pertMostLikelyMinutes: 15 + (i % 30),
          pertPessimisticMinutes: 30 + (i % 50),
        })),
        autoDependencies: {
          mode: 'none',
        },
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/bulk')
        .send(bulkPayload)
        .expect(201);

      const elapsed = Date.now() - startTime;
      const bodyList = response.body as TaskResponse[];

      // Validate results
      expect(bodyList).toBeDefined();
      expect(Array.isArray(bodyList)).toBe(true);
      expect(bodyList.length).toBe(100);

      // Validate all tasks have checklist
      bodyList.forEach((task: TaskResponse, index: number) => {
        expect(task._id).toBeDefined();
        expect(task.name).toContain(`Performance test task ${index + 1}`);
        expect(task.microTaskType).toBeDefined();
        expect(task.checklist).toBeDefined();
        expect(Array.isArray(task.checklist)).toBe(true);
        expect((task.checklist || []).length).toBeGreaterThanOrEqual(3);
        expect(task.pertExpectedMinutes).toBeDefined();
      });

      // Performance assertions
      const avgTimePerTask = elapsed / 100;
      const totalSeconds = elapsed / 1000;

      console.log(`
🏃 Performance Test Results:
  Total time: ${totalSeconds.toFixed(2)}s
  Average per task: ${avgTimePerTask.toFixed(1)}ms
  Target: <500ms per task
  Status: ${avgTimePerTask < 500 ? '✅ PASS' : '❌ FAIL'}
      `);

      // Assert performance (should complete 100 tasks in < 50 seconds)
      expect(elapsed).toBeLessThan(50000);
      expect(avgTimePerTask).toBeLessThan(500);
    });

    it('should retrieve all 100 bulk-inserted tasks', async () => {
      const response = await request(app.getHttpServer() as App)
        .get(`/tasks`)
        .expect(200);

      const bodyList = response.body as TaskResponse[];
      expect(bodyList).toBeDefined();
      expect(Array.isArray(bodyList)).toBe(true);
      expect(bodyList.length).toBeGreaterThanOrEqual(100);
    });

    it('should filter 100 tasks by project', async () => {
      const response = await request(app.getHttpServer() as App)
        .get(`/tasks?project=${projectId}`)
        .expect(200);

      const bodyList = response.body as TaskResponse[];
      expect(bodyList).toBeDefined();
      expect(Array.isArray(bodyList)).toBe(true);
      expect(bodyList.length).toBeGreaterThanOrEqual(100);

      // All should be from our project
      bodyList.forEach((task: TaskResponse) => {
        expect(task.project).toBe(projectId);
      });
    });

    it('should count different micro-task types in bulk insert', async () => {
      const response = await request(app.getHttpServer() as App)
        .get(`/tasks?project=${projectId}`)
        .expect(200);

      const tasks = response.body as TaskResponse[];
      const typeCounts = {
        subtask: 0,
        habit: 0,
        quick: 0,
        complex: 0,
      };

      tasks.forEach((task: TaskResponse) => {
        if (task.microTaskType && task.microTaskType in typeCounts) {
          typeCounts[task.microTaskType as keyof typeof typeCounts]++;
        }
      });

      console.log(`
📊 Task Type Distribution:
  Subtask: ${typeCounts.subtask}
  Habit: ${typeCounts.habit}
  Quick: ${typeCounts.quick}
  Complex: ${typeCounts.complex}
      `);

      // Should have roughly even distribution (25 each for 100 tasks)
      Object.values(typeCounts).forEach((count) => {
        expect(count).toBeGreaterThan(15); // At least 15 of each type
      });
    });
  });

  describe('PERT Calculation Verification', () => {
    it('should calculate PERT correctly (E = (O + 4M + P) / 6)', async () => {
      const testCases = [
        { o: 10, m: 20, p: 40, expected: Math.round((10 + 4 * 20 + 40) / 6) },
        { o: 5, m: 10, p: 20, expected: Math.round((5 + 4 * 10 + 20) / 6) },
        { o: 30, m: 60, p: 120, expected: Math.round((30 + 4 * 60 + 120) / 6) },
      ];

      for (const tc of testCases) {
        const payload = {
          name: `PERT calc test: O=${tc.o}, M=${tc.m}, P=${tc.p}`,
          description: 'Verify PERT formula',
          microTaskType: 'quick',
          project: projectId,
          autoGenerateChecklist: true,
          pertOptimisticMinutes: tc.o,
          pertMostLikelyMinutes: tc.m,
          pertPessimisticMinutes: tc.p,
        };

        const response = await request(app.getHttpServer() as App)
          .post('/tasks/micro')
          .send(payload)
          .expect(201);

        const body = response.body as TaskResponse;
        expect(body.pertExpectedMinutes).toBe(tc.expected);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small PERT values', async () => {
      const payload = {
        name: 'Very small PERT',
        description: 'Minimum viable task',
        microTaskType: 'quick',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 1,
        pertMostLikelyMinutes: 2,
        pertPessimisticMinutes: 3,
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(201);

      const body = response.body as TaskResponse;
      expect(body.pertExpectedMinutes).toBeDefined();
      expect(body.pertExpectedMinutes).toBeGreaterThan(0);
    });

    it('should handle large PERT values', async () => {
      const payload = {
        name: 'Large PERT',
        description: 'Very complex task',
        microTaskType: 'complex',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 600,
        pertMostLikelyMinutes: 1200,
        pertPessimisticMinutes: 2400,
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(201);

      const body = response.body as TaskResponse;
      expect(body.pertExpectedMinutes).toBeDefined();
      expect(body.pertExpectedMinutes).toBeGreaterThan(600);
    });

    it('should handle micro-tasks without deadline', async () => {
      const payload = {
        name: 'No deadline task',
        description: 'Task without specific deadline',
        microTaskType: 'habit',
        project: projectId,
        autoGenerateChecklist: true,
        pertOptimisticMinutes: 5,
        pertMostLikelyMinutes: 10,
        pertPessimisticMinutes: 20,
        // deadline omitted
      };

      const response = await request(app.getHttpServer() as App)
        .post('/tasks/micro')
        .send(payload)
        .expect(201);

      const body = response.body as TaskResponse;
      expect(body._id).toBeDefined();
      // deadline may be null or auto-calculated
    });
  });
});
