import { CreateTaskDto } from './create-task.dto';

export class CreateMicroTaskDto extends CreateTaskDto {
  /**
   * If true (default), backend tries to auto-generate checklist when missing.
   */
  autoGenerateChecklist?: boolean;

  /**
   * Example payload:
   * {
   *   "name": "Refatorar composable de tarefas",
   *   "description": "Extrair responsabilidades e reduzir acoplamento",
   *   "project": "663d9d9345d07bf8eb04b4b7",
   *   "microTaskType": "subtask",
   *   "pomodorosPlanned": 2,
   *   "deadline": "2026-04-16T18:00:00.000Z",
   *   "pertOptimisticMinutes": 20,
   *   "pertMostLikelyMinutes": 30,
   *   "pertPessimisticMinutes": 45,
   *   "autoGenerateChecklist": true
   * }
   */
}
