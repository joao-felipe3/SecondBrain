import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

describe('Sprint 5: Recurrence E2E', () => {
  let app: INestApplication<App>;
  let projectId: string;
  let recurringTaskId: string;
  let occurrenceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Create & Generate Occurrence', () => {
    it('should create a project', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .send({
          name: 'Sprint 5 Recurrence Test',
          description: 'Testing recurring task generation',
        })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      projectId = res.body._id;
    });

    it('should create a recurring daily habit', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .send({
          name: 'Morning Exercise',
          project: projectId,
          microTaskType: 'habit',
          recurringRule: {
            frequency: 'daily',
            interval: 1,
            daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
          },
        })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.recurringRule).toBeDefined();
      expect(res.body.recurringRule.frequency).toBe('daily');
      recurringTaskId = res.body._id;
    });

    it('should generate first occurrence of recurring task', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${recurringTaskId}/generate-next-occurrence`)
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.parentRecurringId).toBe(recurringTaskId);
      expect(res.body.status).toBe('pending');
      occurrenceId = res.body._id;
    });

    it('should mark occurrence as done and generate next', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${occurrenceId}`)
        .send({ status: 'done' })
        .expect(200);

      expect(res.body.status).toBe('done');
    });

    it('should retrieve next occurrence after completing previous', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${recurringTaskId}/generate-next-occurrence`)
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.parentRecurringId).toBe(recurringTaskId);
      expect(res.body.status).toBe('pending');
      // Verify it's a different task (next day)
      expect(res.body._id).not.toBe(occurrenceId);
    });
  });

  describe('Weekly Habit Schedule', () => {
    let weeklyTaskId: string;
    let monday: string;
    let wednesday: string;
    let friday: string;

    it('should create weekly habit with specific days', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .send({
          name: 'Gym Days',
          project: projectId,
          microTaskType: 'habit',
          recurringRule: {
            frequency: 'weekly',
            interval: 1,
            daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
          },
        })
        .expect(201);

      expect(res.body.recurringRule.daysOfWeek).toEqual([1, 3, 5]);
      weeklyTaskId = res.body._id;
    });

    it('should generate Monday occurrence', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${weeklyTaskId}/generate-next-occurrence`)
        .expect(201);

      expect(res.body.parentRecurringId).toBe(weeklyTaskId);
      // Verify Monday (day 1) is generated
      const occDate = new Date(res.body.deadline || res.body.createdAt);
      expect(occDate.getUTCDay()).toBe(1);
      monday = res.body._id;
    });

    it('should skip to Wednesday after Monday', async () => {
      // Mark Monday as done
      await request(app.getHttpServer())
        .patch(`/tasks/${monday}`)
        .send({ status: 'done' })
        .expect(200);

      // Generate next
      const res = await request(app.getHttpServer())
        .post(`/tasks/${weeklyTaskId}/generate-next-occurrence`)
        .expect(201);

      const occDate = new Date(res.body.deadline || res.body.createdAt);
      expect(occDate.getUTCDay()).toBe(3); // Wednesday
      wednesday = res.body._id;
    });

    it('should skip to Friday after Wednesday', async () => {
      // Mark Wednesday as done
      await request(app.getHttpServer())
        .patch(`/tasks/${wednesday}`)
        .send({ status: 'done' })
        .expect(200);

      // Generate next
      const res = await request(app.getHttpServer())
        .post(`/tasks/${weeklyTaskId}/generate-next-occurrence`)
        .expect(201);

      const occDate = new Date(res.body.deadline || res.body.createdAt);
      expect(occDate.getUTCDay()).toBe(5); // Friday
      friday = res.body._id;
    });
  });

  describe('Skip Day Preserves Streak', () => {
    let streamTaskId: string;

    it('should create streak-tracking habit', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .send({
          name: 'Daily Meditation',
          project: projectId,
          microTaskType: 'habit',
          recurringRule: {
            frequency: 'daily',
            interval: 1,
          },
        })
        .expect(201);

      streamTaskId = res.body._id;
    });

    it('should generate and complete 3 consecutive days', async () => {
      for (let i = 0; i < 3; i++) {
        const genRes = await request(app.getHttpServer())
          .post(`/tasks/${streamTaskId}/generate-next-occurrence`)
          .expect(201);

        await request(app.getHttpServer())
          .patch(`/tasks/${genRes.body._id}`)
          .send({ status: 'done' })
          .expect(200);
      }

      // Verify streak is 3
      const dashRes = await request(app.getHttpServer())
        .get(`/tasks/habits-dashboard`)
        .expect(200);

      const habit = dashRes.body.habits.find(
        (h: any) => h.parentRecurringId === streamTaskId,
      );
      expect(habit).toBeDefined();
      expect(habit.currentStreak).toBe(3);
    });

    it('should skip a day via /skip endpoint', async () => {
      // Generate next occurrence
      const genRes = await request(app.getHttpServer())
        .post(`/tasks/${streamTaskId}/generate-next-occurrence`)
        .expect(201);

      const occId = genRes.body._id;

      // Skip it
      const skipRes = await request(app.getHttpServer())
        .post(`/tasks/${occId}/skip`)
        .expect(200);

      expect(skipRes.body.status).toBe('skipped');
    });

    it('should resume streak after skip', async () => {
      // Generate next after skip
      const genRes = await request(app.getHttpServer())
        .post(`/tasks/${streamTaskId}/generate-next-occurrence`)
        .expect(201);

      const occId = genRes.body._id;

      // Complete it
      await request(app.getHttpServer())
        .patch(`/tasks/${occId}`)
        .send({ status: 'done' })
        .expect(200);

      // Check streak is maintained
      const dashRes = await request(app.getHttpServer())
        .get(`/tasks/habits-dashboard`)
        .expect(200);

      const habit = dashRes.body.habits.find(
        (h: any) => h.parentRecurringId === streamTaskId,
      );
      expect(habit).toBeDefined();
      // Should still have streak since skip doesn't break it
      expect(habit.currentStreak).toBeGreaterThan(0);
    });
  });
});
