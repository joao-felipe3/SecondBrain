import { PartialType } from '@nestjs/mapped-types';
import { CreateProjectDto } from './create-project.dto';
import { SmartObjectiveDto } from './smart-objective.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  smartObjective?: SmartObjectiveDto;
}
