import { describe, it, expect } from 'vitest';
import { buildAuditResolution } from '~/composables/features/useConversionHelpers';

describe('buildAuditResolution', () => {
  it('retorna null sem auditoria', () => {
    expect(buildAuditResolution(null, 10)).toBeNull();
  });

  it('regenerate (incompleto/repetitivo) remove o repetido e gera o que falta', () => {
    expect(buildAuditResolution({ diagnosis: 'incomplete', suggestedAction: 'regenerate' }, 40)).toEqual(
      {
        type: 'dedupe-then-complete',
      },
    );
    expect(buildAuditResolution({ diagnosis: 'repetitive', suggestedAction: 'regenerate' }, 40)).toEqual(
      {
        type: 'dedupe-then-complete',
      },
    );
  });

  it('rebaseline nunca fica abaixo das horas já detalhadas', () => {
    const r = buildAuditResolution(
      { diagnosis: 'overestimated', suggestedAction: 'rebaseline', suggestedEstimatedHours: 30 },
      40,
    );
    expect(r).toMatchObject({ type: 'rebaseline', hours: 40 });
  });

  it('mixed com simplify usa dedupe + simplify', () => {
    const r = buildAuditResolution(
      { diagnosis: 'mixed', suggestedAction: 'simplify', suggestedEstimatedHours: 20 },
      40,
    );
    expect(r).toMatchObject({ type: 'dedupe-then-simplify-to-target', targetHours: 20 });
  });

  it('"ok" / none não aplica nada', () => {
    expect(buildAuditResolution({ diagnosis: 'ok', suggestedAction: 'none' }, 10)).toBeNull();
  });
});
