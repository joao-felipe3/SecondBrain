import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TASKS_IMAGE,
  TASKS_STAGE_MODE,
  TASKS_BG_URL,
  BOARD_RECTS,
  BOARD_COLUMNS,
  BOARD_FRAME,
  BOARD_BOTTOM_RAIL,
  tasksStageRect,
  boardCssVars,
  isCompactMural,
  paperLayoutForWidth,
  JOURNAL_PAPER_LAYOUT,
  SCENE_PAPER_LAYOUT,
} from '~/composables/ui/useTasksScene';
import { matchesTaskFilters, priorityBucket } from '~/composables/features/taskFilters';
import { summarizeTasks, formatPomodoroTime } from '~/composables/features/taskStats';
import { getCardAccents, isTaskLate } from '~/components/features/tasks/kanban/cardAccents';

// o Vitest roda com cwd = Frontend (no jsdom o import.meta.url não é um caminho de arquivo)
const root = (p: string) => resolve(process.cwd(), p);

describe('useTasksScene: geometria do quadro pintado', () => {
  const panels = BOARD_COLUMNS.map((c) => tasksStageRect(BOARD_RECTS[c].panel));
  const plaques = BOARD_COLUMNS.map((c) => tasksStageRect(BOARD_RECTS[c].plaque));

  it('os 3 painéis cabem inteiros no palco 16:9', () => {
    for (const r of [...panels, ...plaques]) {
      expect(r.x).toBeGreaterThan(0);
      expect(r.y).toBeGreaterThan(0);
      expect(r.x + r.w).toBeLessThan(1);
      expect(r.y + r.h).toBeLessThan(1);
    }
  });

  it('colunas em ordem todo -> doing -> done, sem sobreposição', () => {
    expect(panels[0].x + panels[0].w).toBeLessThan(panels[1].x);
    expect(panels[1].x + panels[1].w).toBeLessThan(panels[2].x);
  });

  it('cada placa rúnica fica logo acima do seu painel', () => {
    BOARD_COLUMNS.forEach((_, i) => {
      expect(plaques[i].y + plaques[i].h).toBeLessThanOrEqual(panels[i].y + 0.01);
      expect(Math.abs(plaques[i].x + plaques[i].w / 2 - (panels[i].x + panels[i].w / 2))).toBeLessThan(
        0.02,
      );
    });
  });

  it('o quadro é o protagonista: ocupa quase toda a largura e sobra o topo para a placa', () => {
    expect(Math.min(...plaques.map((p) => p.y))).toBeGreaterThan(0.07); // placa pendurada do título
    const frame = tasksStageRect(BOARD_FRAME);
    expect(frame.x).toBeGreaterThan(0.02);
    expect(frame.x + frame.w).toBeLessThan(0.98);
    expect(frame.w).toBeGreaterThan(0.85);
    const rail = tasksStageRect(BOARD_BOTTOM_RAIL);
    expect(rail.y + rail.h).toBeLessThan(1.01); // botão "Novo Contrato" visível
  });

  it('folhas legíveis (escala >= 1) em qualquer palco de desktop/tablet deitado', () => {
    const px = (w: number) => panels.map((p) => p.w * w);
    // 1920 e um monitor 1848x954 (palco de 1696): 2 por linha
    for (const w of [...px(1920), ...px(1696)]) {
      const l = paperLayoutForWidth(w, SCENE_PAPER_LAYOUT);
      expect(l.perRow).toBe(2);
      expect(l.scale).toBeGreaterThanOrEqual(1);
    }
    // 1366 e tablet deitado: 1 por linha, maior
    for (const w of [...px(1366), ...px(1180)]) {
      const l = paperLayoutForWidth(w, SCENE_PAPER_LAYOUT);
      expect(l.scale).toBeGreaterThanOrEqual(1);
    }
  });

  it('boardCssVars sai em unidades de container do palco', () => {
    const vars = boardCssVars();
    expect(vars['--col-todo-x']).toMatch(/cqw$/);
    expect(vars['--col-todo-y']).toMatch(/cqh$/);
    expect(vars['--plaque-done-w']).toMatch(/cqw$/);
    expect(vars['--rail-h']).toMatch(/cqh$/);
  });

  it('o CSS de .mural-bg espelha TASKS_STAGE_MODE', () => {
    const vue = readFileSync(root('components/features/tasks/page/TasksMural.vue'), 'utf-8');
    const block = vue.slice(vue.indexOf('.mural-bg {'), vue.indexOf('}', vue.indexOf('.mural-bg {')));
    const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;
    const pos = `${pct(TASKS_STAGE_MODE.posX)} ${pct(TASKS_STAGE_MODE.posY)}`;
    expect(block).toContain(`object-position: ${pos}`);
    expect(block).toContain(`transform-origin: ${pos}`);
    expect(block).toContain(`scale(${TASKS_STAGE_MODE.scale})`);
  });

  it('a arte existe, é leve e tem a proporção usada na geometria', () => {
    const file = root(`public${TASKS_BG_URL}`);
    expect(statSync(file).size).toBeLessThan(2_000_000);
    // dimensões pelo cabeçalho do WebP (VP8 com perda, VP8L sem perda ou VP8X estendido)
    const head = readFileSync(file).subarray(0, 30);
    expect(head.toString('ascii', 0, 4)).toBe('RIFF');
    const chunk = head.toString('ascii', 12, 16);
    let w = 0;
    let h = 0;
    if (chunk === 'VP8X') {
      w = 1 + head.readUIntLE(24, 3);
      h = 1 + head.readUIntLE(27, 3);
    } else if (chunk === 'VP8 ') {
      w = head.readUInt16LE(26) & 0x3fff;
      h = head.readUInt16LE(28) & 0x3fff;
    } else if (chunk === 'VP8L') {
      const bits = head.readUInt32LE(21);
      w = 1 + (bits & 0x3fff);
      h = 1 + ((bits >> 14) & 0x3fff);
    }
    expect({ w, h }).toEqual({ w: TASKS_IMAGE.width, h: TASKS_IMAGE.height });
  });
});

describe('isCompactMural: cena x diário', () => {
  it.each([
    [1920, 1080, false],
    [2560, 1080, false],
    [1366, 768, false],
    [1180, 820, false], // tablet deitado
    [820, 1180, true], // tablet em pé
    [390, 844, true],
    [360, 740, true],
    [844, 390, true], // celular deitado: altura curta
    [600, 900, true],
  ])('%ix%i -> compacto=%s', (w, h, expected) => {
    expect(isCompactMural(w, h)).toBe(expected);
  });
});

describe('paperLayoutForWidth', () => {
  it('nunca passa da escala antiga com 2 por linha', () => {
    expect(paperLayoutForWidth(600)).toEqual({ perRow: 2, scale: 0.85 });
  });
  it('no diário o tablet em pé ganha mais folhas por linha e maiores', () => {
    const tablet = paperLayoutForWidth(728, JOURNAL_PAPER_LAYOUT);
    expect(tablet.perRow).toBe(4);
    expect(tablet.scale).toBe(1);
    const phone = paperLayoutForWidth(330, JOURNAL_PAPER_LAYOUT);
    expect(phone.perRow).toBe(2);
    expect(phone.scale).toBeGreaterThan(0.9);
  });

  it('troca para 1 por linha quando 2 ficariam ilegíveis', () => {
    const l = paperLayoutForWidth(200);
    expect(l.perRow).toBe(1);
    expect(l.scale).toBeGreaterThan(0.85);
  });
});

describe('filtros do mural', () => {
  it('prioridade 1..4 do slider vira baixa/média/alta', () => {
    expect(priorityBucket(undefined)).toBe('low');
    expect(priorityBucket(1)).toBe('low');
    expect(priorityBucket(2)).toBe('medium');
    expect(priorityBucket(3)).toBe('high');
    expect(priorityBucket(4)).toBe('high');
    expect(priorityBucket('medium')).toBe('medium');
  });

  it('o filtro de prioridade agora casa com tarefas reais (bug: comparava "3" com "high")', () => {
    const task = { project: 'p1', priority: 3 };
    expect(matchesTaskFilters(task, { priorityFilter: 'high' })).toBe(true);
    expect(matchesTaskFilters(task, { priorityFilter: 'low' })).toBe(false);
  });

  it('projeto (ObjectId) e tipo continuam como antes', () => {
    const habit = { project: 'p2', microTaskType: 'habit' };
    expect(matchesTaskFilters(habit, { projectFilter: 'p2', typeFilter: 'habit' })).toBe(true);
    expect(matchesTaskFilters(habit, { projectFilter: 'p1' })).toBe(false);
    expect(matchesTaskFilters({ project: 'p1' }, { typeFilter: 'task' })).toBe(true);
    expect(matchesTaskFilters({ project: 'p1' }, {})).toBe(true);
  });
});

describe('acentos das folhas', () => {
  const now = new Date('2026-11-18T12:00:00');

  it('selo por coluna: vermelho, azul, verde', () => {
    expect(getCardAccents({}, 'todo', now).seal).toBe('red');
    expect(getCardAccents({}, 'doing', now).seal).toBe('blue');
    expect(getCardAccents({ isConcluded: true }, 'done', now).seal).toBe('green');
  });

  it('atrasada ganha adaga; concluída nunca', () => {
    expect(getCardAccents({ late: true }, 'todo', now).pin).toBe('dagger');
    expect(getCardAccents({ deadline: '2026-11-16T10:00:00' }, 'doing', now).pin).toBe('dagger');
    expect(getCardAccents({ deadline: '2026-11-18T08:00:00' }, 'todo', now).pin).toBe('nail'); // vence hoje
    expect(getCardAccents({ late: true, isConcluded: true }, 'done', now).pin).toBe('nail');
    expect(isTaskLate({ late: true, status: 'done' }, now)).toBe(false);
  });

  it('ampulheta só em andamento com pomodoros planejados', () => {
    expect(getCardAccents({ pomodorosPlanned: 4, pomodorosDid: 1 }, 'doing', now).hourglass).toEqual({
      progress: 25,
      active: true,
    });
    expect(getCardAccents({ pomodorosPlanned: 2, pomodorosDid: 2 }, 'doing', now).hourglass).toEqual({
      progress: 100,
      active: false,
    });
    expect(getCardAccents({ pomodorosPlanned: 4 }, 'todo', now).hourglass).toBeNull();
    expect(getCardAccents({}, 'doing', now).hourglass).toBeNull();
  });

  it('cumpridas ganham medalha e carimbo CUMPRIDO', () => {
    const a = getCardAccents({ isConcluded: true }, 'done', now);
    expect(a.medal).toBe(true);
    expect(a.stamp).toBe(true);
    expect(getCardAccents({}, 'doing', now).stamp).toBe(false);
  });
});

describe('livro-caixa (mesmas contas do StatsCard)', () => {
  it('formata minutos como antes', () => {
    expect(formatPomodoroTime(0)).toBe('0min');
    expect(formatPomodoroTime(50)).toBe('50min');
    expect(formatPomodoroTime(120)).toBe('2h');
    expect(formatPomodoroTime(325)).toBe('5h 25min');
  });

  it('separa pendentes e cumpridas com pomodoros x 25 min', () => {
    const s = summarizeTasks([{ pomodorosPlanned: 4 }, { pomodorosPlanned: 2, isConcluded: true }, {}]);
    expect(s.pending).toEqual({ count: 2, minutes: 100, time: '1h 40min' });
    expect(s.completed).toEqual({ count: 1, minutes: 50, time: '50min' });
  });
});
