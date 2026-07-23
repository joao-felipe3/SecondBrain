import { sanitizeJSON, extractAndValidateJSON } from '../../../../src/ai/utils/json-sanitizer.util';

describe('json-sanitizer.util', () => {
  describe('sanitizeJSON', () => {
    it('deve remover quebras de linha dentro de strings', () => {
      const input = '{\n  "title": "Linha 1\nLinha 2"\n}';
      const sanitized = sanitizeJSON(input);
      expect(sanitized).toBe('{\n  "title": "Linha 1 Linha 2"\n}');
    });

    it('deve remover vírgulas sobressalentes no final de objetos e arrays', () => {
      const input = '{"a": 1, "b": 2, "arr": [1, 2, ], }';
      const sanitized = sanitizeJSON(input);
      expect(sanitized).toBe('{"a": 1, "b": 2, "arr": [1, 2]}');
    });

    it('deve manter JSONs válidos sem alteração destrutiva', () => {
      const input = '{"key": "value"}';
      const sanitized = sanitizeJSON(input);
      expect(sanitized).toBe('{"key": "value"}');
    });
  });

  describe('extractAndValidateJSON', () => {
    it('deve extrair e validar JSON delimitado por blocos markdown ```json', () => {
      const responseText = '```json\n{"name": "Projeto Alpha", "status": "active"}\n```';
      const result = extractAndValidateJSON(responseText, ['name', 'status']);

      expect(result).toEqual({ name: 'Projeto Alpha', status: 'active' });
    });

    it('deve retornar null se algum campo obrigatório estiver ausente', () => {
      const responseText = '{"name": "Projeto Alpha"}';
      const result = extractAndValidateJSON(responseText, ['name', 'status']);

      expect(result).toBeNull();
    });

    it('deve retornar null se nenhum JSON for encontrado na resposta', () => {
      const responseText = 'Aqui está uma resposta sem formato de objeto JSON.';
      const result = extractAndValidateJSON(responseText, ['name']);

      expect(result).toBeNull();
    });

    it('deve retornar null se o JSON for sintaticamente inválido', () => {
      const responseText = '{"name": "Inválido"';
      const result = extractAndValidateJSON(responseText, ['name']);

      expect(result).toBeNull();
    });
  });
});
