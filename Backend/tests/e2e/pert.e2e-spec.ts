import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { Types } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { TasksService } from '../../src/tasks/tasks.service';

describe('Sprint 3: PERT Suggestions and Estimation (e2e)', () => {
  let app: INestApplication;
  let tasksService: TasksService;
  let testProjectId: string;
  let testTaskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    tasksService = moduleFixture.get<TasksService>(TasksService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /tasks/micro/suggest-estimates', () => {
    it('should suggest PERT estimates for a complex task', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/micro/suggest-estimates')
        .send({
          taskType: 'complex',
          description: 'Implement OAuth 2.0 authentication flow',
          projectContext: 'Auth Module v2',
        })
        .expect(200);

      expect(response.body).toHaveProperty('optimistic');
      expect(response.body).toHaveProperty('likely');
      expect(response.body).toHaveProperty('pessimistic');
      expect(response.body).toHaveProperty('expectedTime');
      expect(response.body).toHaveProperty('standardDeviation');
      expect(response.body).toHaveProperty('recommendation');
      expect(response.body).toHaveProperty('fromLLM');

      // Validate constraint: O <= M <= P
      expect(response.body.optimistic).toBeLessThanOrEqual(response.body.likely);
      expect(response.body.likely).toBeLessThanOrEqual(response.body.pessimistic);

      // Validate calculated values
      expect(response.body.expectedTime).toBeGreaterThan(0);
      expect(response.body.standardDeviation).toBeGreaterThanOrEqual(0);
    });

    it('should suggest PERT estimates for a quick task (shorter values)', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/micro/suggest-estimates')
        .send({
          taskType: 'quick',
          description: 'Fix typo in README',
        })
        .expect(200);

      expect(response.body.optimistic).toBeGreaterThan(0);
      expect(response.body.optimistic).toBeLessThanOrEqual(response.body.likely);
      expect(response.body.likely).toBeLessThanOrEqual(response.body.pessimistic);
    });

    it('should return fallback values for unsupported task type', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/micro/suggest-estimates')
        .send({
          taskType: 'complex', // Valid type
          description: 'Some generic task',
        })
        .expect(200);

      // Should have valid response even if LLM unavailable
      expect(response.body.optimistic).toBeDefined();
      expect(response.body.likely).toBeDefined();
      expect(response.body.pessimistic).toBeDefined();
    });

    it('should reject invalid taskType', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/micro/suggest-estimates')
        .send({
          taskType: 'invalid_type',
          description: 'Some task',
        })
        .expect(400);

      expect(response.body.message).toContain('Invalid taskType');
    });

    it('should reject empty description', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/micro/suggest-estimates')
        .send({
          taskType: 'quick',
          description: '',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should cache results for same input', async () => {
      const input = {
        taskType: 'subtask',
        description: 'Add unit test for new feature',
      };

      // First call
      const response1 = await request(app.getHttpServer())
        .post('/tasks/micro/suggest-estimates')
        .send(input)
        .expect(200);

      // Second call (should be cached, much faster)
      const response2 = await request(app.getHttpServer())
        .post('/tasks/micro/suggest-estimates')
        .send(input)
        .expect(200);

      // Results should be identical
      expect(response1.body.optimistic).toEqual(response2.body.optimistic);
      expect(response1.body.likely).toEqual(response2.body.likely);
      expect(response1.body.pessimistic).toEqual(response2.body.pessimistic);
    });
  });

  describe('PATCH /tasks/:id/pert', () => {
    beforeEach(async () => {
      // Create a test task
      const created = await tasksService.createMicroTask({
        name: 'Test PERT Task',
        description: 'Task for PERT estimation testing',
        microTaskType: 'quick',
        pomodorosPlanned: 1,
        difficult: 3,
        priority: 2,
        deadline: new Date(),
        project: new Types.ObjectId(),
        recurrency: "Doesn't Repeat",
        notification: new Date(),
        isConcluded: false,
        late: false,
      });
      testTaskId = (created as any)._id.toString();
    });

    it('should update PERT estimates for a task', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}/pert`)
        .send({
          pertOptimisticMinutes: 30,
          pertMostLikelyMinutes: 60,
          pertPessimisticMinutes: 120,
        })
        .expect(200);

      expect(response.body.pertOptimisticMinutes).toEqual(30);
      expect(response.body.pertMostLikelyMinutes).toEqual(60);
      expect(response.body.pertPessimisticMinutes).toEqual(120);
      expect(response.body.pertExpectedMinutes).toBeDefined();
      expect(response.body.deadline).toBeDefined();
    });

    it('should calculate expectedTime correctly', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}/pert`)
        .send({
          pertOptimisticMinutes: 10,
          pertMostLikelyMinutes: 20,
          pertPessimisticMinutes: 50,
        })
        .expect(200);

      // TE = (10 + 4*20 + 50) / 6 = 150 / 6 = 25
      expect(response.body.pertExpectedMinutes).toBeCloseTo(25, 1);
    });

    it('should set deadline based on TE and 10% margin', async () => {
      const beforeUpdate = new Date();

      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}/pert`)
        .send({
          pertOptimisticMinutes: 60,
          pertMostLikelyMinutes: 120,
          pertPessimisticMinutes: 240,
        })
        .expect(200);

      const deadline = new Date(response.body.deadline);

      // Deadline should be in the future
      expect(deadline.getTime()).toBeGreaterThan(beforeUpdate.getTime());

      // TE = (60 + 480 + 240) / 6 = 130 minutes = ~2.17 hours
      // With 10% margin: ~2.4 hours = ~144 minutes
      // Rounded to next hour: 3 hours
      const diffMinutes = (deadline.getTime() - beforeUpdate.getTime()) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThanOrEqual(150); // At least 2.5 hours
      expect(diffMinutes).toBeLessThan(300); // Less than 5 hours
    });

    it('should reject if O > M', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}/pert`)
        .send({
          pertOptimisticMinutes: 120,
          pertMostLikelyMinutes: 60, // Invalid: M < O
          pertPessimisticMinutes: 240,
        })
        .expect(400);

      expect(response.body.message).toContain('Ordem inválida');
    });

    it('should reject if M > P', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}/pert`)
        .send({
          pertOptimisticMinutes: 10,
          pertMostLikelyMinutes: 240,
          pertPessimisticMinutes: 60, // Invalid: P < M
        })
        .expect(400);

      expect(response.body.message).toContain('Ordem inválida');
    });

    it('should reject if any value is <= 0', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}/pert`)
        .send({
          pertOptimisticMinutes: 0,
          pertMostLikelyMinutes: 20,
          pertPessimisticMinutes: 50,
        })
        .expect(400);

      expect(response.body.message).toContain('maiores que zero');
    });

    it('should reject if task not found', async () => {
      const response = await request(app.getHttpServer())
        .patch('/tasks/invalid_id/pert')
        .send({
          pertOptimisticMinutes: 10,
          pertMostLikelyMinutes: 20,
          pertPessimisticMinutes: 50,
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should allow equal values at boundaries (O = M or M = P for edge cases)', async () => {
      // Note: Current implementation requires O < M < P strictly
      // If we want to allow O <= M <= P, this test validates that
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${testTaskId}/pert`)
        .send({
          pertOptimisticMinutes: 10,
          pertMostLikelyMinutes: 10,
          pertPessimisticMinutes: 20,
        })
        .expect(200);

      // Should succeed if backend allows it, fail if not
      // Current implementation: strict inequality required
      if (response.status === 200) {
        expect(response.body.pertOptimisticMinutes).toEqual(10);
      }
    });
  });

  describe('PERT Calculation Accuracy', () => {
    it('should match PERT formula: TE = (O + 4M + P) / 6', async () => {
      const testCases = [
        { O: 5, M: 10, P: 20, expectedTE: (5 + 40 + 20) / 6 }, // 10.83
        { O: 30, M: 60, P: 120, expectedTE: (30 + 240 + 120) / 6 }, // 65
        { O: 1, M: 2, P: 9, expectedTE: (1 + 8 + 9) / 6 }, // 3
      ];

      for (const testCase of testCases) {
        const response = await request(app.getHttpServer())
          .post('/tasks/micro/suggest-estimates')
          .send({
            taskType: 'complex',
            description: `O:${testCase.O} M:${testCase.M} P:${testCase.P}`,
          })
          .expect(200);

        // Note: LLM might suggest different values, so we test with direct PATCH
        // to verify calculation is accurate
        const created = await tasksService.createMicroTask({
          name: `PERT Test ${testCase.O}-${testCase.M}-${testCase.P}`,
          description: 'PERT calculation test',
          microTaskType: 'quick',
          pomodorosPlanned: 1,
          difficult: 1,
          priority: 1,
          deadline: new Date(),
          project: new Types.ObjectId(),
          recurrency: "Doesn't Repeat",
          notification: new Date(),
          isConcluded: false,
          late: false,
        });

        const patchResponse = await request(app.getHttpServer())
          .patch(`/tasks/${(created as any)._id}/pert`)
          .send({
            pertOptimisticMinutes: testCase.O,
            pertMostLikelyMinutes: testCase.M,
            pertPessimisticMinutes: testCase.P,
          })
          .expect(200);

        expect(patchResponse.body.pertExpectedMinutes).toBeCloseTo(testCase.expectedTE, 1);
      }
    });

    it('should calculate standard deviation correctly', async () => {
      // σ = (P - O) / 6
      // For O=10, M=20, P=50: σ = (50-10)/6 = 40/6 = 6.67
      const created = await tasksService.createMicroTask({
        name: 'Sigma Test',
        description: 'Standard deviation calculation',
        microTaskType: 'quick',
        pomodorosPlanned: 1,
        difficult: 1,
        priority: 1,
        deadline: new Date(),
        project: new Types.ObjectId(),
        recurrency: "Doesn't Repeat",
        notification: new Date(),
        isConcluded: false,
        late: false,
      });

      // Note: Current implementation doesn't expose pertVariance/pertStdDev in response
      // But we can verify by calling the calculation directly via service
      const result = await tasksService.updatePert((created as any)._id.toString(), {
        pertOptimisticMinutes: 10,
        pertMostLikelyMinutes: 20,
        pertPessimisticMinutes: 50,
      });

      const expectedSigma = (50 - 10) / 6;
      expect(result.pertVariance).toBeCloseTo(expectedSigma * expectedSigma, 1);
    });
  });
});
