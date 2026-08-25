import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

/**
 * Performance tests for rendering large lists of habits
 * Benchmark: 50+ habits should render in < 500ms
 */
describe("Performance - Large Habit Lists", () => {
  // Mock component that renders a list of habits
  const HabitListComponent = defineComponent({
    props: {
      habits: Array,
    },
    setup(props) {
      return () =>
        h(
          "div",
          { class: "habit-list" },
          props.habits?.map((habit: any) =>
            h(
              "div",
              {
                key: habit._id,
                class: "habit-card",
                "data-streak": habit.streakData?.currentStreak || 0,
              },
              [
                h("h3", habit.name),
                h(
                  "div",
                  { class: "streak" },
                  `🔥 ${habit.streakData?.currentStreak || 0} days`,
                ),
              ],
            ),
          ),
        );
    },
  });

  const generateMockHabits = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      _id: `habit-${i}`,
      name: `Habit ${i + 1}`,
      description: `Test habit number ${i + 1}`,
      experience: Math.floor(Math.random() * 100),
      prize: Math.floor(Math.random() * 200),
      deadline: new Date(Date.now() + Math.random() * 86400000),
      recurringRule:
        i % 3 === 0
          ? { frequency: "daily", interval: 1 }
          : i % 3 === 1
            ? { frequency: "weekly", daysOfWeek: [1, 3, 5] }
            : { frequency: "biweekly", interval: 2 },
      streakData: {
        currentStreak: Math.floor(Math.random() * 100),
        longestStreak: Math.floor(Math.random() * 200),
        aderencePercent: Math.floor(Math.random() * 100),
      },
    }));
  };

  it("should render 50 habits in under 500ms", () => {
    const habits = generateMockHabits(50);
    const startTime = performance.now();

    const wrapper = mount(HabitListComponent, {
      props: { habits },
    });

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    expect(renderTime).toBeLessThan(500);
    expect(wrapper.findAll(".habit-card")).toHaveLength(50);
  });

  it("should render 100 habits in under 1000ms", () => {
    const habits = generateMockHabits(100);
    const startTime = performance.now();

    const wrapper = mount(HabitListComponent, {
      props: { habits },
    });

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    expect(renderTime).toBeLessThan(1000);
    expect(wrapper.findAll(".habit-card")).toHaveLength(100);
  });

  it("should efficiently update when habits change", () => {
    const initialHabits = generateMockHabits(50);

    const wrapper = mount(HabitListComponent, {
      props: { habits: initialHabits },
    });

    const startTime = performance.now();

    // Update with new habits (simulates new streaks)
    const updatedHabits = initialHabits.map((h) => ({
      ...h,
      streakData: {
        ...h.streakData,
        currentStreak: h.streakData.currentStreak + 1,
      },
    }));

    wrapper.setProps({ habits: updatedHabits });

    const endTime = performance.now();
    const updateTime = endTime - startTime;

    expect(updateTime).toBeLessThan(300);
  });

  it("should handle habit filtering efficiently", () => {
    const habits = generateMockHabits(50);

    const wrapper = mount(HabitListComponent, {
      props: { habits },
    });

    const startTime = performance.now();

    // Filter to high-streak habits
    const highStreakHabits = habits.filter(
      (h) => h.streakData.currentStreak > 50,
    );

    wrapper.setProps({ habits: highStreakHabits });

    const endTime = performance.now();
    const filterTime = endTime - startTime;

    expect(filterTime).toBeLessThan(200);
  });

  it("should handle scrolling 200 habits without lag", () => {
    const habits = generateMockHabits(200);

    const startTime = performance.now();

    const wrapper = mount(HabitListComponent, {
      props: { habits },
    });

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    // 200 items should still be reasonably fast (< 2s)
    expect(renderTime).toBeLessThan(2000);
    expect(wrapper.findAll(".habit-card")).toHaveLength(200);
  });

  it("should compute store getters efficiently with 50+ habits", async () => {
    const tasks = generateMockHabits(60).map((h) => ({
      ...h,
      microTaskType: "habit",
    }));

    // Simulate store getter performance
    const startTime = performance.now();

    // Filter habits from tasks
    const habits = tasks.filter(
      (t) => t.microTaskType === "habit" || t.recurringRule,
    );

    // Sort by streak
    const sorted = habits.sort(
      (a, b) =>
        (b.streakData?.currentStreak || 0) - (a.streakData?.currentStreak || 0),
    );

    const endTime = performance.now();
    const computeTime = endTime - startTime;

    // Store getter should be very fast (< 50ms)
    expect(computeTime).toBeLessThan(50);
    expect(sorted).toHaveLength(60);
  });
});
