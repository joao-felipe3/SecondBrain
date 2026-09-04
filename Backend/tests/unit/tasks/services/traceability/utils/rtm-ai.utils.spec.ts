import {
  normalizeGeneratedItems,
  formatTasksForPrompt,
  processMappingResponse,
  applyFallbackMapping,
} from '@src/tasks/services/traceability/utils/rtm-ai.utils';
import { Task } from '@src/tasks/entities/task.entity';

describe('rtm-ai.utils', () => {
  describe('normalizeGeneratedItems', () => {
    it('should normalize items with default ref prefixes for each kind when ref is absent', () => {
      const parsed = [
        { kind: 'objective', description: 'Objective 1' },
        { kind: 'habit', description: 'Habit 1' },
        { kind: 'stage', description: 'Stage 1' },
        { kind: 'action', description: 'Action 1' },
      ];

      const normalized = normalizeGeneratedItems(parsed);
      expect(normalized.length).toBe(4);
      expect(normalized[0].ref).toBe('O1');
      expect(normalized[1].ref).toBe('H2');
      expect(normalized[2].ref).toBe('E3');
      expect(normalized[3].ref).toBe('A4');
    });

    it('should keep explicit ref, normalize parentRef, and remove duplicates', () => {
      const parsed = [
        { ref: 'OBJ-A', parentRef: 'ROOT', kind: 'objective', description: 'Duplicated Item' },
        { ref: 'OBJ-B', kind: 'objective', description: 'Duplicated Item' }, // duplicate description under same kind
        { kind: 'action', description: '' }, // empty description should be filtered out
      ];

      const normalized = normalizeGeneratedItems(parsed);
      expect(normalized.length).toBe(1);
      expect(normalized[0].ref).toBe('OBJ-A');
      expect(normalized[0].parentRef).toBe('ROOT');
    });
  });

  describe('formatTasksForPrompt', () => {
    it('should format tasks as bullet list with name and id', () => {
      const batch: Task[] = [
        { id: 't1', name: 'Task One' } as any,
        { id: 't2', name: 'Task Two' } as any,
      ];
      const result = formatTasksForPrompt(batch);
      expect(result).toBe('- "Task One" (ID: t1)\n- "Task Two" (ID: t2)');
    });
  });

  describe('processMappingResponse', () => {
    it('should distribute mappings to requirementId or orphanTasks', () => {
      const batch: Task[] = [{ id: 't1', name: 'Task 1' } as any, { id: 't2', name: 'Task 2' } as any];
      const mappings: Record<string, string[]> = {};
      const orphans: Task[] = [];

      processMappingResponse(
        [
          { taskId: 't1', requirementId: 'req-1' },
          { taskId: 't2', requirementId: 'ORPHAN' },
          { taskId: 'non-existent', requirementId: 'ORPHAN' }, // task not found in batch
          { taskId: '', requirementId: 'req-1' }, // empty taskId ignored
        ],
        batch,
        mappings,
        orphans,
      );

      expect(mappings['req-1']).toEqual(['t1']);
      expect(orphans.length).toBe(1);
      expect(orphans[0].id).toBe('t2');
    });
  });

  describe('applyFallbackMapping', () => {
    it('should assign all tasks in batch to fallback action id', () => {
      const batch: Task[] = [{ id: 't1', name: 'Task 1' } as any, { id: 't2', name: 'Task 2' } as any];
      const mappings: Record<string, string[]> = {};

      applyFallbackMapping(batch, 'fallback-action', mappings);
      expect(mappings['fallback-action']).toEqual(['t1', 't2']);
    });
  });
});
