import { TasksModule } from '@src/tasks/tasks.module';

describe('TasksModule', () => {
  it('should be defined and instantiate module class', () => {
    const module = new TasksModule();
    expect(module).toBeDefined();
  });
});
