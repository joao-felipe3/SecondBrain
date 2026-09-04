import {
  normalizeKind,
  normalizeType,
  levelForKind,
  getLinkedActions,
  parseJsonArray,
} from '@src/tasks/services/traceability/utils/rtm.utils';

describe('rtm.utils', () => {
  describe('normalizeKind', () => {
    it('should normalize objective in english and portuguese', () => {
      expect(normalizeKind('objective')).toBe('objective');
      expect(normalizeKind('OBJETIVO')).toBe('objective');
    });

    it('should normalize habit in english and portuguese variations', () => {
      expect(normalizeKind('habit')).toBe('habit');
      expect(normalizeKind('habito')).toBe('habit');
      expect(normalizeKind('Hábito')).toBe('habit');
    });

    it('should normalize stage in english and portuguese', () => {
      expect(normalizeKind('stage')).toBe('stage');
      expect(normalizeKind('Etapa')).toBe('stage');
    });

    it('should fallback to action for any other value or non-string', () => {
      expect(normalizeKind('action')).toBe('action');
      expect(normalizeKind('unknown')).toBe('action');
      expect(normalizeKind(null)).toBe('action');
      expect(normalizeKind(undefined)).toBe('action');
      expect(normalizeKind(123)).toBe('action');
      expect(normalizeKind(true)).toBe('action');
      expect(normalizeKind(Symbol('test'))).toBe('action');
      expect(normalizeKind({})).toBe('action');
    });
  });

  describe('normalizeType', () => {
    it('should normalize functional and non_functional variations', () => {
      expect(normalizeType('functional')).toBe('functional');
      expect(normalizeType('non_functional')).toBe('non_functional');
      expect(normalizeType('non-functional')).toBe('non_functional');
      expect(normalizeType('nonfunctional')).toBe('non_functional');
    });

    it('should normalize constraint, objective, habit, stage, action in pt/en', () => {
      expect(normalizeType('constraint')).toBe('constraint');
      expect(normalizeType('objective')).toBe('objective');
      expect(normalizeType('objetivo')).toBe('objective');
      expect(normalizeType('habit')).toBe('habit');
      expect(normalizeType('habito')).toBe('habit');
      expect(normalizeType('hábito')).toBe('habit');
      expect(normalizeType('stage')).toBe('stage');
      expect(normalizeType('etapa')).toBe('stage');
      expect(normalizeType('action')).toBe('action');
      expect(normalizeType('acao')).toBe('action');
      expect(normalizeType('ação')).toBe('action');
    });

    it('should use fallbackKind if provided, or default to action', () => {
      expect(normalizeType('unknown', 'habit')).toBe('habit');
      expect(normalizeType('unknown')).toBe('action');
    });
  });

  describe('levelForKind', () => {
    it('should return correct hierarchical level', () => {
      expect(levelForKind('objective')).toBe(0);
      expect(levelForKind('habit')).toBe(1);
      expect(levelForKind('stage')).toBe(2);
      expect(levelForKind('action')).toBe(3);
    });
  });

  describe('getLinkedActions', () => {
    it('should prefer traceableActionItems when available', () => {
      const req: any = {
        traceableActionItems: ['act-1', 'act-2'],
        traceableItems: ['act-legacy'],
      };
      expect(getLinkedActions(req)).toEqual(['act-1', 'act-2']);
    });

    it('should fallback to traceableItems when traceableActionItems is empty', () => {
      const req: any = {
        traceableActionItems: [],
        traceableItems: ['act-legacy-1'],
      };
      expect(getLinkedActions(req)).toEqual(['act-legacy-1']);
    });

    it('should return empty array if both are undefined', () => {
      expect(getLinkedActions({})).toEqual([]);
    });
  });

  describe('parseJsonArray', () => {
    it('should parse direct JSON array', () => {
      const res = parseJsonArray('[{"id": 1}, {"id": 2}]');
      expect(res).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should parse JSON array wrapped in markdown code blocks', () => {
      const md = '```json\n[{"name": "test"}]\n```';
      expect(parseJsonArray(md)).toEqual([{ name: 'test' }]);

      const genericMd = '```\n["item1", "item2"]\n```';
      expect(parseJsonArray(genericMd)).toEqual(['item1', 'item2']);
    });

    it('should extract array embedded inside text', () => {
      const text = 'Here is the result: [{"key": "val"}] - hope this helps!';
      expect(parseJsonArray(text)).toEqual([{ key: 'val' }]);
    });

    it('should return null for non-array JSON or invalid JSON', () => {
      expect(parseJsonArray('{"not": "an array"}')).toBeNull();
      expect(parseJsonArray('invalid json text')).toBeNull();
      expect(parseJsonArray('')).toBeNull();
    });
  });
});
