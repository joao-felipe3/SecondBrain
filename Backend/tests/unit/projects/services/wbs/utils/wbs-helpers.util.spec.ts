import {
  inferCognitiveType,
  extractDefinitionOfDone,
  extractChecklistSteps,
  getLeafNodesWithPaths,
  computeLeafHours,
  shrinkLeafTasksToTargetHours,
} from '@src/projects/services/wbs/utils/wbs-helpers.util';

describe('wbs-helpers.util', () => {
  describe('inferCognitiveType', () => {
    it('should infer cognitive types based on text keywords', () => {
      expect(inferCognitiveType('Simulado de prova')).toBe('test');
      expect(inferCognitiveType('Revisar conceitos de flashcards')).toBe('review');
      expect(inferCognitiveType('Escrever documentação da API')).toBe('deep');
      expect(inferCognitiveType('Pesquisar e listar requisitos')).toBe('capture');
      expect(inferCognitiveType('')).toBe('other');
    });
  });

  describe('extractDefinitionOfDone & extractChecklistSteps', () => {
    it('should extract definition of done from text', () => {
      const text = 'Descrição da tarefa. Definição de pronto: Código commitado e testado';
      expect(extractDefinitionOfDone(text)).toBe('Código commitado e testado');
      expect(extractDefinitionOfDone('Apenas descrição')).toBeUndefined();
    });

    it('should extract numbered or bulleted checklist steps', () => {
      const numberedText = '1. Passo de teste 1\n2. Passo de teste 2\n3. Passo 3';
      expect(extractChecklistSteps(numberedText)).toEqual([
        'Passo de teste 1',
        'Passo de teste 2',
        'Passo 3',
      ]);

      const bulletText = '- Item de checagem 1\n* Item de checagem 2';
      expect(extractChecklistSteps(bulletText)).toEqual(['Item de checagem 1', 'Item de checagem 2']);

      expect(extractChecklistSteps('Texto simples sem lista')).toBeUndefined();
    });
  });

  describe('getLeafNodesWithPaths, computeLeafHours & shrinkLeafTasksToTargetHours', () => {
    it('should extract leaf nodes with computed path strings', () => {
      const tree: any[] = [
        {
          name: 'Fase 1',
          children: [
            { name: 'Subfase 1.1', children: [] },
            { name: 'Subfase 1.2', children: [{ name: 'Pacote 1.2.1' }] },
          ],
        },
      ];

      const leaves = getLeafNodesWithPaths(tree);
      expect(leaves.length).toBe(2);
      expect(leaves[0].path).toBe('Fase 1 > Subfase 1.1');
      expect(leaves[1].path).toBe('Fase 1 > Subfase 1.2 > Pacote 1.2.1');
    });

    it('should compute leaf hours and shrink tasks to target hours', () => {
      const tasks = [{ pomodorosPlanned: 4 }, { pomodorosPlanned: 6 }];
      expect(computeLeafHours(tasks)).toBe(5); // 10 poms * 0.5 = 5h

      shrinkLeafTasksToTargetHours(tasks, 2.5); // reduce to 5 poms total
      expect(computeLeafHours(tasks)).toBe(2.5);
    });
  });
});
