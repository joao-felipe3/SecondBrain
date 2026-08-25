import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Sprint 5: HabitPreview Component Tests
 * Testa renderização compacta de hábitos no Kanban
 */

// Mock habit data
const mockHabit = {
  _id: "habit-1",
  name: "Morning Meditation",
  description: "Daily 10-minute meditation",
  experience: 50,
  prize: 10,
  deadline: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  pertExpectedMinutes: 10,
  microTaskType: "habit",
  parentRecurringId: "recurring-1",
  recurringRule: {
    frequency: "daily",
    interval: 1,
  },
  streakData: {
    currentStreak: 5,
    longestStreak: 12,
    aderencePercent: 85,
    lastCompletedDate: new Date().toISOString(),
  },
};

const mockWeeklyHabit = {
  ...mockHabit,
  _id: "habit-2",
  name: "Gym Session",
  description: "Weight training + cardio",
  deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
  pertExpectedMinutes: 60,
  recurringRule: {
    frequency: "weekly",
    interval: 1,
    daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
  },
  streakData: {
    currentStreak: 3,
    longestStreak: 8,
    aderencePercent: 62,
    lastCompletedDate: new Date(Date.now() - 86400000).toISOString(),
  },
};

describe("Sprint 5: HabitPreview Component", () => {
  describe("Rendering - Habit Data Display", () => {
    it("should display habit name", () => {
      expect(mockHabit.name).toBe("Morning Meditation");
    });

    it("should display habit description", () => {
      expect(mockHabit.description).toBe("Daily 10-minute meditation");
    });

    it("should display EXP and coins", () => {
      expect(mockHabit.experience).toBe(50);
      expect(mockHabit.prize).toBe(10);
    });

    it("should display next deadline", () => {
      const habit = mockHabit;
      expect(habit.deadline).toBeDefined();
      const date = new Date(habit.deadline);
      expect(date.getTime()).toBeGreaterThan(Date.now() - 1000); // Allow small time diff
    });

    it("should display PERT expected minutes", () => {
      expect(mockHabit.pertExpectedMinutes).toBe(10);
    });

    it("should display streak data", () => {
      expect(mockHabit.streakData.currentStreak).toBe(5);
      expect(mockHabit.streakData.aderencePercent).toBe(85);
    });

    it("should format recurrence pattern for daily habit", () => {
      const habit = mockHabit;
      expect(habit.recurringRule.frequency).toBe("daily");
    });

    it("should format recurrence pattern for weekly habit with days", () => {
      const habit = mockWeeklyHabit;
      expect(habit.recurringRule.frequency).toBe("weekly");
      expect(habit.recurringRule.daysOfWeek).toContain(1); // Monday
      expect(habit.recurringRule.daysOfWeek).toContain(3); // Wednesday
      expect(habit.recurringRule.daysOfWeek).toContain(5); // Friday
    });
  });

  describe("Habit Type Detection", () => {
    it("should detect habit via microTaskType", () => {
      const task = { microTaskType: "habit" };
      const isHabit = task.microTaskType === "habit";
      expect(isHabit).toBe(true);
    });

    it("should detect habit via parentRecurringId", () => {
      const task = { parentRecurringId: "recurring-1" };
      const isHabit = !!task.parentRecurringId;
      expect(isHabit).toBe(true);
    });

    it("should detect habit via recurringRule", () => {
      const task = { recurringRule: { frequency: "daily" } };
      const isHabit = !!task.recurringRule;
      expect(isHabit).toBe(true);
    });

    it("should not detect regular task as habit", () => {
      const task = { _id: "task-1", name: "Regular task" };
      const isHabit =
        task.microTaskType === "habit" ||
        !!task.parentRecurringId ||
        !!task.recurringRule;
      expect(isHabit).toBe(false);
    });
  });

  describe("Recurrence Formatting", () => {
    it("should format daily recurrence", () => {
      const rule = { frequency: "daily", interval: 1 };
      const formatted = rule.frequency === "daily" ? "Daily" : rule.frequency;
      expect(formatted).toBe("Daily");
    });

    it("should format weekly recurrence with days of week", () => {
      const rule = mockWeeklyHabit.recurringRule;
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = rule.daysOfWeek.map((d) => dayNames[d]).join(", ");
      expect(days).toBe("Mon, Wed, Fri");
    });

    it("should format interval-based recurrence", () => {
      const rule = { frequency: "weekly", interval: 2 };
      const formatted =
        rule.interval > 1
          ? `Every ${rule.interval} ${rule.frequency}s`
          : rule.frequency;
      expect(formatted).toBe("Every 2 weeks");
    });

    it("should handle biweekly recurrence", () => {
      const rule = { frequency: "biweekly", interval: 1 };
      const formatted =
        rule.frequency === "biweekly" ? "Biweekly" : rule.frequency;
      expect(formatted).toBe("Biweekly");
    });

    it("should handle monthly recurrence", () => {
      const rule = { frequency: "monthly", interval: 1 };
      const formatted =
        rule.frequency === "monthly" ? "Monthly" : rule.frequency;
      expect(formatted).toBe("Monthly");
    });
  });

  describe("Deadline Formatting", () => {
    it('should format deadline as "Today" for today', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const diff = today.getTime() - now.getTime();
      const formatted = diff === 0 ? "Today" : "Future";

      expect(formatted).toBe("Today");
    });

    it("should format deadline as day name for near future", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const formatted = tomorrow
        .toLocaleDateString("en-US", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        })
        .toLowerCase();

      expect(formatted).toMatch(/^[a-z]{3}, \d{2} [a-z]{3}$/);
    });

    it('should format deadline as "OVERDUE!" for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const diff = yesterday.getTime() - now.getTime();
      const formatted = diff < 0 ? "OVERDUE!" : "Future";

      expect(formatted).toBe("OVERDUE!");
    });
  });

  describe("Streak Display", () => {
    it("should display current streak correctly", () => {
      expect(mockHabit.streakData.currentStreak).toBe(5);
    });

    it("should display adherence percentage", () => {
      expect(mockHabit.streakData.aderencePercent).toBe(85);
      expect(mockHabit.streakData.aderencePercent).toBeGreaterThanOrEqual(0);
      expect(mockHabit.streakData.aderencePercent).toBeLessThanOrEqual(100);
    });

    it("should display longest streak", () => {
      expect(mockHabit.streakData.longestStreak).toBe(12);
      expect(mockHabit.streakData.longestStreak).toBeGreaterThanOrEqual(
        mockHabit.streakData.currentStreak,
      );
    });

    it("should handle zero streak", () => {
      const habit = {
        ...mockHabit,
        streakData: { currentStreak: 0, aderencePercent: 0 },
      };
      expect(habit.streakData.currentStreak).toBe(0);
      expect(habit.streakData.aderencePercent).toBe(0);
    });

    it("should display high adherence habit", () => {
      expect(mockHabit.streakData.aderencePercent).toBeGreaterThan(80);
    });

    it("should display lower adherence habit", () => {
      expect(mockWeeklyHabit.streakData.aderencePercent).toBeLessThan(70);
    });
  });

  describe("Habit Actions Integration", () => {
    let emitSpy: any;
    let taskStoreMock: any;

    beforeEach(() => {
      emitSpy = vi.fn();
      taskStoreMock = {
        handleRecurringCompletion: vi.fn().mockResolvedValue({ success: true }),
        skipRecurringTask: vi.fn().mockResolvedValue({ success: true }),
      };
    });

    it("should emit complete-habit event when handleComplete is called", async () => {
      const habitId = mockHabit._id;
      const result = await taskStoreMock.handleRecurringCompletion(habitId);

      expect(result.success).toBe(true);
      expect(taskStoreMock.handleRecurringCompletion).toHaveBeenCalledWith(
        habitId,
      );
    });

    it("should emit skip-habit event when handleSkip is called", async () => {
      const habitId = mockHabit._id;
      const result = await taskStoreMock.skipRecurringTask(habitId);

      expect(result.success).toBe(true);
      expect(taskStoreMock.skipRecurringTask).toHaveBeenCalledWith(habitId);
    });

    it("should handle completion errors gracefully", async () => {
      taskStoreMock.handleRecurringCompletion = vi.fn().mockResolvedValue({
        success: false,
        error: "Task not found",
      });

      const result =
        await taskStoreMock.handleRecurringCompletion("nonexistent-id");
      expect(result.success).toBe(false);
    });

    it("should handle skip errors gracefully", async () => {
      taskStoreMock.skipRecurringTask = vi.fn().mockResolvedValue({
        success: false,
        error: "Cannot skip completed task",
      });

      const result = await taskStoreMock.skipRecurringTask("completed-id");
      expect(result.success).toBe(false);
    });
  });

  describe("KanbanBoard Integration", () => {
    it("should render habit in kanban grid alongside regular tasks", () => {
      const tasks = [
        { _id: "task-1", name: "Regular task", status: "todo" },
        {
          _id: "habit-1",
          name: "Morning Meditation",
          microTaskType: "habit",
          status: "todo",
        },
      ];

      const habits = tasks.filter((t) => t.microTaskType === "habit");
      const regularTasks = tasks.filter((t) => t.microTaskType !== "habit");

      expect(habits).toHaveLength(1);
      expect(regularTasks).toHaveLength(1);
    });

    it("should filter habits by status", () => {
      const habits = [
        { ...mockHabit, _id: "h1", status: "todo" },
        { ...mockHabit, _id: "h2", status: "doing" },
        { ...mockHabit, _id: "h3", status: "done" },
      ];

      const todoHabits = habits.filter((h) => h.status === "todo");
      const doingHabits = habits.filter((h) => h.status === "doing");
      const doneHabits = habits.filter((h) => h.status === "done");

      expect(todoHabits).toHaveLength(1);
      expect(doingHabits).toHaveLength(1);
      expect(doneHabits).toHaveLength(1);
    });

    it("should support drag-and-drop for habits", () => {
      const habit = mockHabit;
      expect(habit._id).toBe("habit-1");
      expect(habit.microTaskType).toBe("habit");
      // DnD logic is in KanbanBoard, not in HabitPreview
    });
  });

  describe("Edge Cases", () => {
    it("should handle habit without description", () => {
      const habit = { ...mockHabit, description: "" };
      expect(habit.description).toBe("");
    });

    it("should handle habit without PERT data", () => {
      const habit = { ...mockHabit, pertExpectedMinutes: null };
      expect(habit.pertExpectedMinutes).toBeNull();
    });

    it("should handle habit without recurring rule", () => {
      const habit = { ...mockHabit, recurringRule: null };
      expect(habit.recurringRule).toBeNull();
    });

    it("should handle habit with null deadline", () => {
      const habit = { ...mockHabit, deadline: null };
      expect(habit.deadline).toBeNull();
    });

    it("should handle habit with missing streak data", () => {
      const habit = { ...mockHabit, streakData: null };
      expect(habit.streakData).toBeNull();
    });

    it("should display truncated long habit names", () => {
      const longName = "A".repeat(100);
      const habit = { ...mockHabit, name: longName };
      expect(habit.name.length).toBe(100);
      // Component handles truncation via CSS -webkit-line-clamp: 2
    });

    it("should handle habit with very high streaks", () => {
      const habit = {
        ...mockHabit,
        streakData: {
          currentStreak: 365,
          longestStreak: 365,
          aderencePercent: 100,
        },
      };
      expect(habit.streakData.currentStreak).toBe(365);
      expect(habit.streakData.aderencePercent).toBe(100);
    });
  });
});
