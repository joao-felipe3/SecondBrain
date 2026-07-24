import {
  repairJsonString,
  extractJsonArray,
  extractJsonObject,
} from '@src/projects/services/wbs/utils/json-parser.util';

describe('json-parser.util', () => {
  describe('repairJsonString', () => {
    it('should normalize smart/curly quotes to standard quotes', () => {
      const input = '{\u201Ckey\u201D: \u2018value\u2019}';
      const output = repairJsonString(input);
      expect(output).toContain('"key"');
      expect(output).toContain('"value"');
    });

    it('should remove control characters', () => {
      const input = '{"key": "val\x05ue"}';
      const output = repairJsonString(input);
      expect(output).toBe('{"key": "val ue"}');
    });

    it('should remove trailing commas in objects and arrays', () => {
      const input = '{"key": "value", "arr": [1, 2, ], }';
      const output = repairJsonString(input);
      expect(output).toBe('{"key": "value", "arr": [1, 2]}');
    });

    it('should remove duplicate commas', () => {
      const input = '{"a": 1,, "b": 2}';
      const output = repairJsonString(input);
      expect(output).toBe('{"a": 1, "b": 2}');
    });

    it('should quote unquoted or single-quoted keys', () => {
      const input = "{ 'key1': 1, key2: 'val' }";
      const output = repairJsonString(input);
      expect(output).toContain('"key1":');
      expect(output).toContain('"key2":');
      expect(output).toContain(': "val"');
    });

    it('should handle unescaped newlines in string values safely', () => {
      const input = '{\n"key": "val\nline"\n}';
      const output = repairJsonString(input);
      expect(typeof output).toBe('string');
    });
  });

  describe('extractJsonArray', () => {
    it('should throw if input is empty or not a string', () => {
      expect(() => extractJsonArray('')).toThrow('Resposta da IA vazia');
      expect(() => extractJsonArray(null as unknown as string)).toThrow('Resposta da IA vazia');
    });

    it('should parse direct JSON array inside markdown fences', () => {
      const input = '```json\n[{"id": 1}, {"id": 2}]\n```';
      const result = extractJsonArray<{ id: number }>(input);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should repair and parse slightly malformed JSON array', () => {
      const input = "[{ id: 1, name: 'task', }]";
      const result = extractJsonArray<{ id: number; name: string }>(input);
      expect(result).toEqual([{ id: 1, name: 'task' }]);
    });

    it('should salvage incomplete/truncated array chunks', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const input = '[{"id": 1, "name": "a"}, {"id": 2, "name": "b"}, {"id": 3, "n';
      const result = extractJsonArray<{ id: number; name: string }>(input);
      expect(result.length).toBe(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should throw error when JSON array cannot be salvaged at all', () => {
      const input = 'This is plain text with no array structure at all';
      expect(() => extractJsonArray(input)).toThrow('Não foi possível extrair array JSON');
    });
  });

  describe('extractJsonObject', () => {
    it('should throw if input is empty or not a string', () => {
      expect(() => extractJsonObject('')).toThrow('Resposta da IA vazia');
      expect(() => extractJsonObject(undefined as unknown as string)).toThrow('Resposta da IA vazia');
    });

    it('should parse direct JSON object inside text/markdown', () => {
      const input = 'Here is the result: ```json\n{"status": "ok", "count": 10}\n```';
      const result = extractJsonObject<{ status: string; count: number }>(input);
      expect(result).toEqual({ status: 'ok', count: 10 });
    });

    it('should repair unquoted keys and single quotes in object', () => {
      const input = "{ status: 'ok', count: 10, }";
      const result = extractJsonObject<{ status: string; count: number }>(input);
      expect(result).toEqual({ status: 'ok', count: 10 });
    });

    it('should salvage truncated object when cut off mid-key/value', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const input = '{"firstKey": "valid", "secondKey": "alsoValid", "truncatedKey": "unfin';
      const result = extractJsonObject<Record<string, unknown>>(input);
      expect(result).toBeDefined();
      expect(result.firstKey).toBe('valid');
      expect(result.secondKey).toBe('alsoValid');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should salvage single truncated key object using last resort', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const input = '{"singleKey": "truncatedVal';
      const result = extractJsonObject<Record<string, unknown>>(input);
      expect(result).toBeDefined();
      expect(result.singleKey).toBe('truncatedVal');
      consoleSpy.mockRestore();
    });

    it('should throw when object extraction fails entirely', () => {
      const input = 'invalid string without object braces';
      expect(() => extractJsonObject(input)).toThrow('Não foi possível extrair objeto JSON');
    });
  });
});
