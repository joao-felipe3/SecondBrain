import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../src/app.module';

/**
 * Sprint 4 E2E Test Suite: Kanban + Rastreabilidade
 *
 * Tests the full flow:
 * 1. Create task in project
 * 2. View task in Kanban (default status = 'todo')
 * 3. Move task between columns (status transitions)
 * 4. Verify persistence across refresh
 * 5. Check lineage and feedback tabs
 */
describe('Sprint 4: Kanban Board E2E Tests', () => {
  let app!: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Task Status Persistence', () => {
    it('should create task with default status=todo', async () => {
      const createTaskDto = {
        name: 'Sprint 4 Test Task',
        description: 'Testing Kanban status persistence',
        project: 'test-project',
      };

      const response = await request(app.getHttpServer())
        .post('/tasks')
        .send(createTaskDto)
        .expect(201);

      expect(response.body.status).toBe('todo');
      expect(response.body.statusUpdatedAt).toBeDefined();
    });

    it('should move task from todo to doing and persist', async () => {
      const taskId = 'test-task-1'; // Assume created in previous test

      // Move to 'doing'
      const moveResponse = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'doing' })
        .expect(200);

      expect(moveResponse.body.status).toBe('doing');

      // Refresh: fetch task again
      const refreshResponse = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .expect(200);

      expect(refreshResponse.body.status).toBe('doing');
      expect(refreshResponse.body.statusUpdatedAt).toBeDefined();
    });

    it('should allow status transitions: todo -> review -> done', async () => {
      const taskId = 'test-task-2';

      // todo -> review
      let response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'review' })
        .expect(200);

      expect(response.body.status).toBe('review');

      // review -> done (should trigger completion flow)
      response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'done' })
        .expect(200);

      expect(response.body.status).toBe('done');
      expect(response.body.isConcluded).toBe(true);
    });

    it('should prevent moving concluded task away from done', async () => {
      const taskId = 'test-concluded-task';

      // Try to move done task back to doing
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'doing' })
        .expect(400);
    });
  });

  describe('Kanban Board Ordering', () => {
    it('should append task to end of destination column', async () => {
      const projectId = 'test-project';

      // Create 3 tasks
      const task1 = await request(app.getHttpServer())
        .post('/tasks')
        .send({ name: 'Task 1', project: projectId })
        .expect(201);

      const task2 = await request(app.getHttpServer())
        .post('/tasks')
        .send({ name: 'Task 2', project: projectId })
        .expect(201);

      const task3 = await request(app.getHttpServer())
        .post('/tasks')
        .send({ name: 'Task 3', project: projectId })
        .expect(201);

      // Move all to 'doing'
      await request(app.getHttpServer())
        .patch(`/tasks/${task1.body._id}/status`)
        .send({ status: 'doing' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tasks/${task2.body._id}/status`)
        .send({ status: 'doing' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tasks/${task3.body._id}/status`)
        .send({ status: 'doing' })
        .expect(200);

      // Fetch all tasks in 'doing' status, ordered by kanbanOrder
      const response = await request(app.getHttpServer())
        .get(`/projects/${projectId}/tasks?status=doing`)
        .expect(200);

      expect(response.body.length).toBe(3);
      expect(response.body[0].kanbanOrder).toBeLessThan(
        response.body[1].kanbanOrder,
      );
      expect(response.body[1].kanbanOrder).toBeLessThan(
        response.body[2].kanbanOrder,
      );
    });
  });

  describe('Lineage Tracking', () => {
    it('should return task genealogy (ancestors + children)', async () => {
      const taskId = 'test-task-with-lineage';

      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/lineage`)
        .expect(200);

      expect(response.body).toHaveProperty('ancestors');
      expect(response.body).toHaveProperty('children');
      expect(response.body).toHaveProperty('warnings');
      expect(Array.isArray(response.body.ancestors)).toBe(true);
      expect(Array.isArray(response.body.children)).toBe(true);
    });

    it('should show parent chain for nested tasks', async () => {
      // Assume: Goal > Project > Task > SubTask structure
      const subTaskId = 'test-subtask';

      const response = await request(app.getHttpServer())
        .get(`/tasks/${subTaskId}/lineage`)
        .expect(200);

      // Should show chain up to root
      expect(response.body.ancestors.length).toBeGreaterThan(0);
      expect(
        response.body.ancestors[response.body.ancestors.length - 1]
          .parentTaskId,
      ).toBeNull();
    });
  });

  describe('Completion Feedback', () => {
    it('should generate feedback when task moved to done', async () => {
      const taskId = 'test-feedback-task';

      // Move to review first, then to done (triggers generateCompletionFeedback asynchronously in real impl)
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'review' })
        .expect(200);

      // Move to done (triggers generateCompletionFeedback asynchronously in real impl)
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'done' })
        .expect(200);

      // Small delay for async feedback generation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Fetch feedback
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/completion-feedback`)
        .expect(200);

      expect(response.body).toHaveProperty('feedback');
      expect(typeof response.body.feedback).toBe('string');
      expect(response.body.feedback.length).toBeGreaterThan(0);
    });

    it('should allow generating feedback on-demand', async () => {
      const taskId = 'test-task-feedback-demand';

      const response = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/completion-feedback`)
        .expect(200);

      expect(response.body).toHaveProperty('feedback');
      expect(typeof response.body.feedback).toBe('string');
    });

    it('should return latest feedback for task', async () => {
      const taskId = 'test-task-latest-feedback';

      // Generate first feedback
      const first = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/completion-feedback`)
        .expect(200);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Generate second feedback
      const second = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/completion-feedback`)
        .expect(200);

      // Fetch latest
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/completion-feedback`)
        .expect(200);

      // Should return the most recent one (by createdAt)
      expect(response.body.feedback).toBe(second.body.feedback);
    });

    it('should persist user-submitted completion feedback after concluding a task', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .send({
          name: 'Task with user feedback',
          description: 'E2E feedback persistence test',
          project: 'feedback-project',
        })
        .expect(201);

      const taskId = createRes.body._id;

      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/conclude`)
        .expect(200);

      const userFeedbackPayload = {
        celebration: 'Entrega concluída com sucesso',
        validation: 'Checklist validado e revisão final aprovada',
        question: 'Houve algum impedimento?',
        impediments: 'Nenhum impeditivo relevante',
        impedimentType: 'none',
        action: null,
        selectedSteps: [
          {
            title: 'Registrar no board',
            description: 'Atualizar status final',
          },
        ],
      };

      const postResponse = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/completion-feedback`)
        .send(userFeedbackPayload)
        .expect(200);

      expect(postResponse.body.feedback).toContain(
        'Entrega concluída com sucesso',
      );

      const getResponse = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/completion-feedback`)
        .expect(200);

      expect(getResponse.body.feedback).toContain(
        'Entrega concluída com sucesso',
      );
      expect(getResponse.body.feedback).toContain(
        'Nenhum impeditivo relevante',
      );
    });
  });

  describe('Kanban Board Constraints', () => {
    it('should block moving to done if checklist incomplete', async () => {
      const taskId = 'test-incomplete-checklist';

      // Move to done should fail if checklist < 100%
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'done' })
        .expect(400);

      expect(response.body.message).toContain('Checklist');
    });

    it('should allow moving to done only with complete checklist', async () => {
      const taskId = 'test-complete-checklist';

      // First, complete all checklist items
      const checklistItems = [{ name: 'Item 1' }, { name: 'Item 2' }];
      for (const item of checklistItems) {
        await request(app.getHttpServer())
          .patch(`/tasks/${taskId}/checklist/${item.name}`)
          .send({ completed: true })
          .expect(200);
      }

      // Review first, then move to done should succeed
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'review' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'done' })
        .expect(200);
    });
  });

  describe('Sprint 4 Full Scenario', () => {
    it('should complete full Kanban workflow', async () => {
      const projectId = 'scenario-project';
      const taskName = 'Full Scenario Task';

      // 1. Create task (status = todo)
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .send({ name: taskName, project: projectId })
        .expect(201);

      const taskId = createRes.body._id;
      expect(createRes.body.status).toBe('todo');

      // 2. Move to doing
      const doingRes = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'doing' })
        .expect(200);

      expect(doingRes.body.status).toBe('doing');

      // 3. Check lineage
      const lineageRes = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/lineage`)
        .expect(200);

      expect(lineageRes.body).toHaveProperty('ancestors');
      expect(lineageRes.body).toHaveProperty('children');

      // 4. Move to review
      const reviewRes = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'review' })
        .expect(200);

      expect(reviewRes.body.status).toBe('review');

      // 5. Complete checklist and move to done
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'done' })
        .expect(200);

      // 6. Generate feedback
      const feedbackRes = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/completion-feedback`)
        .expect(200);

      expect(feedbackRes.body).toHaveProperty('feedback');

      // 7. Verify refresh maintains state
      const refreshRes = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .expect(200);

      expect(refreshRes.body.status).toBe('done');
    });
  });
});
