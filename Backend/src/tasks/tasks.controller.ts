import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova task' })
  @ApiResponse({ status: 201, description: 'Task criada com sucesso.' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as tasks' })
  @ApiResponse({ status: 200, description: 'Lista de tasks retornada com sucesso.' })
  findAll() {
    return this.tasksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const task = this.tasksService.findOne(id);
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    const task = this.tasksService.update(id, updateTaskDto);
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const removed = this.tasksService.remove(id);
    if (!removed) throw new NotFoundException('Task not found');
    return { message: 'Task removed successfully' };
  }

  @Patch(':id/conclude')
  markAsConcluded(@Param('id') id: string) {
    return this.tasksService.markAsConcluded(id);
  }

  @Patch(':id/increment-pomodoro')
  incrementPomodorosDid(@Param('id') id: string) {
    return this.tasksService.incrementPomodorosDid(id);
  }
}
