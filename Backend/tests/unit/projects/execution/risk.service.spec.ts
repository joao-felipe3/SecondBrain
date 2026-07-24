import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RiskService } from '../../../../src/projects/services/execution/risk.service';
import { GeminiService } from '../../../../src/ai/services/core/gemini.service';
import { Risk } from '../../../../src/projects/schemas/risk.schema';

describe('RiskService', () => {
  let service: RiskService;
  let riskModelMock: any;
  let geminiServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    riskModelMock = {
      create: jest.fn().mockResolvedValue({
        _id: 'r-1',
        description: 'Risco de prazo',
        probability: 50,
        impact: 4,
        severity: 'alta',
      }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: 'r-1', description: 'Risco 1' }]),
        }),
        exec: jest.fn().mockResolvedValue([{ _id: 'r-1', description: 'Risco 1' }]),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'r-1', probability: 30, impact: 2, severity: 'média' }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'r-1', status: 'mitigado' }),
      }),
    };

    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(
        JSON.stringify({
          risks: [
            {
              description: 'Risco IA 1',
              probability: 40,
              impact: 3,
              severity: 'média',
              mitigationPlan: 'Mitigar',
            },
          ],
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskService,
        { provide: getModelToken(Risk.name), useValue: riskModelMock },
        { provide: GeminiService, useValue: geminiServiceMock },
      ],
    }).compile();

    service = module.get<RiskService>(RiskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assessRisks', () => {
    it('deve gerar e salvar riscos via IA', async () => {
      const result = await service.assessRisks(validObjectId, 'Descrição do projeto');
      expect(result).toHaveLength(1);
      expect(geminiServiceMock.generateContent).toHaveBeenCalled();
    });
  });

  describe('createRisk', () => {
    it('deve criar um risco manualmente', async () => {
      const dto: any = { description: 'Risco teste', probability: 50, impact: 4 };
      const result = await service.createRisk(validObjectId, dto);

      expect(result).toBeDefined();
      expect(riskModelMock.create).toHaveBeenCalled();
    });
  });

  describe('updateRisk', () => {
    it('deve atualizar o risco por ID', async () => {
      const result = await service.updateRisk('r-1', { status: 'mitigando' });

      expect(result).toBeDefined();
      expect(riskModelMock.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('getRisksByProject', () => {
    it('deve buscar os riscos do projeto', async () => {
      const result = await service.getRisksByProject(validObjectId);

      expect(result).toHaveLength(1);
      expect(riskModelMock.find).toHaveBeenCalled();
    });
  });
});
