import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

interface ProjectResponse {
  _id?: string;
}

interface TaskResponse {
  _id?: string;
  parentRecurringId?: string;
  status?: string;
  deadline?: string;
  createdAt?: string;
  recurringRule?: {
    frequency?: string;
    interval?: number;
    daysOfWeek?: number[];
  };
}

interface HabitDashboardItem {
  parentRecurringId?: string;
  currentStreak?: number;
}

interface HabitsDashboardResponse {
  habits?: HabitDashboardItem[];
}

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

      const body = res.body as ProjectResponse;
      expect(body).toHaveProperty('_id');
      projectId = body._id || '';
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

      const body = res.body as TaskResponse;
      expect(body).toHaveProperty('_id');
      expect(body.recurringRule).toBeDefined();
      expect(body.recurringRule?.frequency).toBe('daily');
      recurringTaskId = body._id || '';
    });

    it('should generate first occurrence of recurring task', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${recurringTaskId}/generate-next-occurrence`)
        .expect(201);

      const body = res.body as TaskResponse;
      expect(body).toHaveProperty('_id');
      expect(body.parentRecurringId).toBe(recurringTaskId);
      expect(body.status).toBe('pending');
      occurrenceId = body._id || '';
    });

    it('should mark occurrence as done and generate next', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${occurrenceId}`)
        .send({ status: 'done' })
        .expect(200);

      const body = res.body as TaskResponse;
      expect(body.status).toBe('done');
    });

    it('should retrieve next occurrence after completing previous', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${recurringTaskId}/generate-next-occurrence`)
        .expect(201);

      const body = res.body as TaskResponse;
      expect(body).toHaveProperty('_id');
      expect(body.parentRecurringId).toBe(recurringTaskId);
      expect(body.status).toBe('pending');
      // Verify it's a different task (next day)
      expect(body._id).not.toBe(occurrenceId);
    });
  });

  describe('Weekly Habit Schedule', () => {
    let weeklyTaskId: string;
    let monday: string;
    let wednesday: string;

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

      const body = res.body as TaskResponse;
      expect(body.recurringRule?.daysOfWeek).toEqual([1, 3, 5]);
      weeklyTaskId = body._id || '';
    });

    it('should generate Monday occurrence', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${weeklyTaskId}/generate-next-occurrence`)
        .expect(201);

      const body = res.body as TaskResponse;
      expect(body.parentRecurringId).toBe(weeklyTaskId);
      // Verify Monday (day 1) is generated
      const occDate = new Date(body.deadline || body.createdAt || '');
      expect(occDate.getUTCDay()).toBe(1);
      monday = body._id || '';
    });

    it('should skip to Wednesday after Monday', async () => {
      // Mark Monday as done
      await request(app.getHttpServer()).patch(`/tasks/${monday}`).send({ status: 'done' }).expect(200);

      // Generate next
      const res = await request(app.getHttpServer())
        .post(`/tasks/${weeklyTaskId}/generate-next-occurrence`)
        .expect(201);

      const body = res.body as TaskResponse;
      const occDate = new Date(body.deadline || body.createdAt || '');
      expect(occDate.getUTCDay()).toBe(3); // Wednesday
      wednesday = body._id || '';
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

      const body = res.body as TaskResponse;
      const occDate = new Date(body.deadline || body.createdAt || '');
      expect(occDate.getUTCDay()).toBe(5); // Friday
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

      const body = res.body as TaskResponse;
      streamTaskId = body._id || '';
    });

    it('should generate and complete 3 consecutive days', async () => {
      for (let i = 0; i < 3; i++) {
        const genRes = await request(app.getHttpServer())
          .post(`/tasks/${streamTaskId}/generate-next-occurrence`)
          .expect(201);

        const genBody = genRes.body as TaskResponse;

        await request(app.getHttpServer())
          .patch(`/tasks/${genBody._id || ''}`)
          .send({ status: 'done' })
          .expect(200);
      }

      // Verify streak is 3
      const dashRes = await request(app.getHttpServer()).get(`/tasks/habits-dashboard`).expect(200);

      const dashBody = dashRes.body as HabitsDashboardResponse;
      const habits = dashBody.habits || [];
      const habit = habits.find((h) => h.parentRecurringId === streamTaskId);
      expect(habit).toBeDefined();
      expect(habit?.currentStreak).toBe(3);
    });

    it('should skip a day via /skip endpoint', async () => {
      // Generate next occurrence
      const genRes = await request(app.getHttpServer())
        .post(`/tasks/${streamTaskId}/generate-next-occurrence`)
        .expect(201);

      const genBody = genRes.body as TaskResponse;
      const occId = genBody._id || '';

      // Skip it
      const skipRes = await request(app.getHttpServer()).post(`/tasks/${occId}/skip`).expect(200);

      const skipBody = skipRes.body as TaskResponse;
      expect(skipBody.status).toBe('skipped');
    });

    it('should resume streak after skip', async () => {
      // Generate next after skip
      const genRes = await request(app.getHttpServer())
        .post(`/tasks/${streamTaskId}/generate-next-occurrence`)
        .expect(201);

      const genBody = genRes.body as TaskResponse;
      const occId = genBody._id || '';

      // Complete it
      await request(app.getHttpServer()).patch(`/tasks/${occId}`).send({ status: 'done' }).expect(200);

      // Check streak is maintained
      const dashRes = await request(app.getHttpServer()).get(`/tasks/habits-dashboard`).expect(200);

      const dashBody = dashRes.body as HabitsDashboardResponse;
      const habits = dashBody.habits || [];
      const habit = habits.find((h) => h.parentRecurringId === streamTaskId);
      expect(habit).toBeDefined();
      // Should still have streak since skip doesn't break it
      expect(habit?.currentStreak ?? 0).toBeGreaterThan(0);
    });
  });
});
