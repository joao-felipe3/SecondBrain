import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { EVMService } from '../../../../../src/projects/services/evm/evm.service';
import { EVMProgressService } from '../../../../../src/projects/services/evm/evm-progress.service';

describe('EVMService', () => {
  let service: EVMService;
  let evmProgressServiceMock: any;
  let projectWaveModelMock: any;
  let projectModelMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    evmProgressServiceMock = {
      getProgressEntries: jest.fn().mockResolvedValue([]),
    };

    projectWaveModelMock = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    projectModelMock = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          name: 'Projeto Teste',
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EVMService,
        { provide: EVMProgressService, useValue: evmProgressServiceMock },
        { provide: getModelToken('ProjectWave'), useValue: projectWaveModelMock },
        { provide: getModelToken('Project'), useValue: projectModelMock },
      ],
    }).compile();

    service = module.get<EVMService>(EVMService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateSPI', () => {
    it('deve lançar BadRequestException para ID inválido', async () => {
      await expect(service.calculateSPI('invalid')).rejects.toThrow(BadRequestException);
    });

    it('deve retornar 1 se PV for zero ou negativo', async () => {
      jest.spyOn(service as any, 'getCoreMetrics').mockResolvedValue({
        pv: 0,
        ev: 10,
      });

      const spi = await service.calculateSPI(validObjectId);
      expect(spi).toBe(1);
    });

    it('deve calcular a taxa SPI corretamente', async () => {
      jest.spyOn(service as any, 'getCoreMetrics').mockResolvedValue({
        pv: 100,
        ev: 90,
      });

      const spi = await service.calculateSPI(validObjectId);
      expect(spi).toBe(0.9);
    });
  });

  describe('getEVMCurve', () => {
    it('deve retornar curvas vazias se não houver entradas de progresso', async () => {
      const result = await service.getEVMCurve(validObjectId);

      expect(result).toEqual({ plannedValue: [], actualValue: [], dates: [] });
    });
  });
});
