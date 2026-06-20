import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { GetHabitsDashboardDto } from '../../dto/monitoring/get-habits-dashboard.dto';
import { GetHabitsDashboardResponseDto } from '../../dto/monitoring/habits-dashboard.dto';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  aderencePercent: number;
  lastCompletedDate: Date | null;
}

interface HabitSummary extends StreakData {
  id: string;
  name: string;
  status: string;
  deadline: Date | null;
}

@Injectable()
export class TasksHabitsService {
  constructor(@InjectModel('Task') private readonly taskModel: Model<TaskDocument>) {}

  // ===========================================================================
  // 1. Habit Tracking & Streak Metrics
  // ===========================================================================

  public async getStreakData(parentRecurringId: string): Promise<StreakData> {
    const seriesTasks = await this._fetchTaskSeries(parentRecurringId);

    if (seriesTasks.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        aderencePercent: 0,
        lastCompletedDate: null,
      };
    }

    return this._calculateStreakMetrics(seriesTasks);
  }

  public async getHabitsDashboard(
    filter: GetHabitsDashboardDto = {},
  ): Promise<GetHabitsDashboardResponseDto> {
    try {
      const habits = await this._fetchHabits(filter);
      const summaries = await this._createHabitSummaries(habits);
      return this._calculateDashboardMetrics(summaries, filter.projectId);
    } catch (error) {
      // Log the error if a logger is available
      // this.logger.error('Failed to get habits dashboard', error.stack);
      throw new BadRequestException('Could not retrieve habits dashboard data.');
    }
  }

  // ===========================================================================
  // Private Helper Methods for Streak Calculation
  // ===========================================================================

  private async _fetchTaskSeries(parentRecurringId: string): Promise<TaskDocument[]> {
    if (!parentRecurringId || !Types.ObjectId.isValid(parentRecurringId)) {
      throw new BadRequestException(`Invalid ID: ${parentRecurringId}`);
    }

    return this.taskModel
      .find({
        $or: [{ _id: parentRecurringId }, { parentRecurringId }],
      })
      .sort({ deadline: 1, createdAt: 1 })
      .exec();
  }

  private _calculateStreakMetrics(tasks: TaskDocument[]): StreakData {
    const aderencePercent = this._calculateAdherence(tasks);
    const currentStreak = this._calculateCurrentStreak(tasks);
    const { longestStreak, lastCompletedDate } = this._calculateLongestStreakAndLastCompletedDate(tasks);

    return {
      currentStreak,
      longestStreak,
      aderencePercent,
      lastCompletedDate,
    };
  }

  private _calculateAdherence(tasks: TaskDocument[]): number {
    if (tasks.length === 0) return 0;
    const maintained = tasks.filter((task) =>
      ['completed', 'skipped'].includes(String(task?.recurringState || '')),
    ).length;
    return Math.round((maintained / tasks.length) * 100);
  }

  private _calculateCurrentStreak(tasks: TaskDocument[]): number {
    let currentStreak = 0;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const state = String(tasks[i]?.recurringState || 'pending');
      if (state === 'completed' || state === 'skipped') {
        currentStreak += 1;
      } else {
        break;
      }
    }
    return currentStreak;
  }

  private _calculateLongestStreakAndLastCompletedDate(tasks: TaskDocument[]): {
    longestStreak: number;
    lastCompletedDate: Date | null;
  } {
    let longestStreak = 0;
    let currentRun = 0;
    let lastCompletedDate: Date | null = null;

    for (const task of tasks) {
      const state = String(task?.recurringState || 'pending');
      if (state === 'completed' || state === 'skipped') {
        currentRun += 1;
        if (state === 'completed') {
          lastCompletedDate = task.deadline || task.createdAt || null;
        }
      } else {
        longestStreak = Math.max(longestStreak, currentRun);
        currentRun = 0;
      }
    }
    longestStreak = Math.max(longestStreak, currentRun);

    return { longestStreak, lastCompletedDate };
  }

  // ===========================================================================
  // Private Helper Methods for Dashboard Generation
  // ===========================================================================

  private _buildHabitsQuery(filter: GetHabitsDashboardDto): FilterQuery<TaskDocument> {
    const query: FilterQuery<TaskDocument> = {
      $or: [{ microTaskType: 'habit' }, { recurringRule: { $exists: true, $ne: null } }],
    };

    if (filter.projectId && Types.ObjectId.isValid(filter.projectId)) {
      query.project = new Types.ObjectId(filter.projectId);
    }

    return query;
  }

  private async _fetchHabits(filter: GetHabitsDashboardDto): Promise<TaskDocument[]> {
    const query = this._buildHabitsQuery(filter);
    return this.taskModel.find(query).sort({ createdAt: -1 }).exec();
  }

  private async _createHabitSummaries(habits: TaskDocument[]): Promise<HabitSummary[]> {
    const summaryPromises = habits.map(async (habit) => {
      const rootId = String(habit.parentRecurringId || habit._id);
      const streak = await this.getStreakData(rootId);
      const deadline = habit.deadline ? new Date(habit.deadline) : null;

      return {
        id: String(habit._id),
        name: String(habit.name || ''),
        status: String(habit.status || 'todo'),
        ...streak,
        deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
      };
    });

    return Promise.all(summaryPromises);
  }

  private _calculateDashboardMetrics(
    summaries: HabitSummary[],
    projectId?: string,
  ): GetHabitsDashboardResponseDto {
    const activeHabits = summaries.filter((habit) => habit.status !== 'done').length;
    const averageAderencePercent =
      summaries.length > 0
        ? Math.round(summaries.reduce((sum, habit) => sum + habit.aderencePercent, 0) / summaries.length)
        : 0;
    const streaksOver7Days = summaries.filter((habit) => habit.currentStreak >= 7).length;
    const dueTodayHabits = this._getDueTodayHabits(summaries);

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

  private _getDueTodayHabits(
    summaries: HabitSummary[],
  ): GetHabitsDashboardResponseDto['dueTodayHabits'] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return summaries
      .filter((habit) => {
        if (habit.status === 'done' || !habit.deadline) return false;
        const deadline = new Date(habit.deadline);
        deadline.setHours(0, 0, 0, 0);
        return deadline.getTime() === todayTime;
      })
      .map((habit) => ({
        id: habit.id,
        name: habit.name,
        deadline: habit.deadline!,
      }));
  }
}
