import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { GetHabitsDashboardDto } from '../../dto/get-habits-dashboard.dto';
import { GetHabitsDashboardResponseDto } from '../../dto/habits-dashboard.dto';

@Injectable()
export class TasksHabitsService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
  ) {}

  async getStreakData(parentRecurringId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    aderencePercent: number;
    lastCompletedDate: Date | null;
  }> {
    if (!parentRecurringId || !Types.ObjectId.isValid(parentRecurringId)) {
      throw new BadRequestException(`ID inválido: ${parentRecurringId}`);
    }

    const seriesTasks = await this.taskModel
      .find({
        $or: [{ _id: parentRecurringId }, { parentRecurringId }],
      })
      .sort({ deadline: 1, createdAt: 1 })
      .exec();

    const recurringTasks = seriesTasks;
    if (recurringTasks.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        aderencePercent: 0,
        lastCompletedDate: null,
      };
    }

    const maintained = recurringTasks.filter((task: any) =>
      ['completed', 'skipped'].includes(String(task?.recurringState || '')),
    ).length;
    const aderencePercent = Math.round(
      (maintained / recurringTasks.length) * 100,
    );

    let currentStreak = 0;
    for (let i = recurringTasks.length - 1; i >= 0; i--) {
      const state = String(
        (recurringTasks[i] as any)?.recurringState || 'pending',
      );
      if (state === 'completed' || state === 'skipped') {
        currentStreak += 1;
      } else {
        break;
      }
    }

    let longestStreak = 0;
    let run = 0;
    let lastCompletedDate: Date | null = null;
    for (const task of recurringTasks as any[]) {
      const state = String(task?.recurringState || 'pending');
      if (state === 'completed' || state === 'skipped') {
        run += 1;
        longestStreak = Math.max(longestStreak, run);
        if (state === 'completed') {
          lastCompletedDate = task.deadline || task.createdAt || null;
        }
      } else {
        run = 0;
      }
    }

    return {
      currentStreak,
      longestStreak,
      aderencePercent,
      lastCompletedDate,
    };
  }

  async getHabitsDashboard(
    filter: GetHabitsDashboardDto = {},
  ): Promise<GetHabitsDashboardResponseDto> {
    const query: any = {
      $or: [
        { microTaskType: 'habit' },
        { recurringRule: { $exists: true, $ne: null } },
      ],
    };

    const projectId = filter.projectId;

    if (projectId && Types.ObjectId.isValid(projectId)) {
      query.project = new Types.ObjectId(projectId);
    }

    const habits = await this.taskModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
    const summaries: GetHabitsDashboardResponseDto['habits'] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const habit of habits as any[]) {
      const rootId = String(habit.parentRecurringId || habit._id);
      const streak = await this.getStreakData(rootId);
      const deadline = habit.deadline ? new Date(habit.deadline) : null;
      summaries.push({
        id: String(habit._id),
        name: String(habit.name || ''),
        status: String(habit.status || 'todo'),
        ...streak,
        deadline:
          deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
      });
    }

    const activeHabits = summaries.filter(
      (habit) => habit.status !== 'done',
    ).length;
    const averageAderencePercent =
      summaries.length > 0
        ? Math.round(
            summaries.reduce((sum, habit) => sum + habit.aderencePercent, 0) /
              summaries.length,
          )
        : 0;
    const streaksOver7Days = summaries.filter(
      (habit) => habit.currentStreak >= 7,
    ).length;
    const dueTodayHabits = summaries
      .filter((habit) => {
        if (habit.status === 'done' || !habit.deadline) return false;
        const deadline = new Date(habit.deadline);
        deadline.setHours(0, 0, 0, 0);
        return deadline.getTime() === today.getTime();
      })
      .map((habit) => ({
        id: habit.id,
        name: habit.name,
        deadline: habit.deadline,
      }));

    return {
      projectId,
      totalHabits: summaries.length,
      activeHabits,
      averageAderencePercent,
      streaksOver7Days,
      dueTodayCount: dueTodayHabits.length,
      dueTodayHabits,
      habits: summaries,
    };
  }
}
