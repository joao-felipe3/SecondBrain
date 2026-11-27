import { convertDraftsToTasks } from '@src/projects/services/wbs/utils/task-conversion-helpers.util';

describe('TaskConversionHelpersUtil', () => {
  describe('convertDraftsToTasks', () => {
    it('should convert draft array to task objects', () => {
      const drafts: any[] = [
        { name: 'Draft 1', pomodorosPlanned: 2, priority: 1, microTaskType: 'code' },
      ];

      const tasks = convertDraftsToTasks(drafts, { project: { _id: 'p1' } });
      expect(tasks.length).toBe(1);
      expect(tasks[0].name).toBe('Draft 1');
    });

    it('should return empty array if drafts is empty', () => {
      expect(convertDraftsToTasks([], {})).toEqual([]);
    });
  });
});
