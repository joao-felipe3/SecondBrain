import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HabitPreview from '~/components/features/tasks/board/HabitPreview.vue'
import Paper from '~/components/features/tasks/board/Paper.vue'

describe('Component Snapshots - Sprint 5 Habits', () => {
  describe('HabitPreview', () => {
    it('should render with default habit data', () => {
      const habit = {
        _id: '123',
        name: 'Morning Exercise',
        description: 'Daily 30-minute workout',
        experience: 50,
        prize: 100,
        deadline: new Date('2026-05-06T08:00:00Z'),
        recurringRule: { frequency: 'daily', interval: 1 },
        streakData: {
          currentStreak: 7,
          longestStreak: 14,
          aderencePercent: 85,
        },
      }

      const wrapper = mount(HabitPreview, {
        props: { habit },
        global: {
          stubs: {
            teleport: true,
          },
        },
      })

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should render with high streak', () => {
      const habit = {
        _id: '456',
        name: 'Meditation',
        description: 'Daily meditation practice',
        experience: 30,
        prize: 60,
        deadline: new Date('2026-05-06T06:00:00Z'),
        recurringRule: { frequency: 'daily' },
        streakData: {
          currentStreak: 45,
          longestStreak: 60,
          aderencePercent: 100,
        },
      }

      const wrapper = mount(HabitPreview, {
        props: { habit },
        global: {
          stubs: {
            teleport: true,
          },
        },
      })

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should render with no streak data', () => {
      const habit = {
        _id: '789',
        name: 'New Habit',
        description: 'Just started',
        experience: 10,
        prize: 20,
        deadline: new Date('2026-05-06T10:00:00Z'),
        recurringRule: { frequency: 'weekly', daysOfWeek: [1, 3, 5] },
      }

      const wrapper = mount(HabitPreview, {
        props: { habit },
        global: {
          stubs: {
            teleport: true,
          },
        },
      })

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should render with weekly schedule', () => {
      const habit = {
        _id: '1011',
        name: 'Gym Days',
        description: 'Mon, Wed, Fri',
        experience: 75,
        prize: 150,
        deadline: new Date('2026-05-06T18:00:00Z'),
        recurringRule: {
          frequency: 'weekly',
          daysOfWeek: [1, 3, 5],
        },
        streakData: {
          currentStreak: 5,
          longestStreak: 15,
          aderencePercent: 78,
        },
      }

      const wrapper = mount(HabitPreview, {
        props: { habit },
        global: {
          stubs: {
            teleport: true,
          },
        },
      })

      expect(wrapper.html()).toMatchSnapshot()
    })
  })

  describe('Paper', () => {
    it('should render task paper collapsed', () => {
      const task = {
        _id: '123',
        name: 'Exercise Task',
        description: 'Daily exercise',
      }

      const wrapper = mount(Paper, {
        props: {
          task,
          tasks: [task],
          positionStyle: { left: '100px', top: '100px' },
          colors: { primary: '#FF6B6B' },
          zoomed: false,
          create: false,
          projects: [],
        },
        global: {
          stubs: {
            teleport: true,
            'v-img': {
              template: '<div class="v-img-stub"></div>',
            },
            Transition: false,
            SvgProjectStamp: {
              template: '<div class="stamp-stub"></div>',
            },
            TaskPreview: {
              template: '<div class="task-preview-stub"></div>',
            },
            HabitPreview: {
              template: '<div class="habit-preview-stub"></div>',
            },
          },
        },
      })

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should render paper with habit component', () => {
      const habit = {
        _id: '456',
        name: 'Morning Meditation',
        description: 'Start the day right',
        microTaskType: 'habit',
        streakData: {
          currentStreak: 10,
          aderencePercent: 90,
        },
      }

      const wrapper = mount(Paper, {
        props: {
          task: habit,
          tasks: [habit],
          positionStyle: { left: '200px', top: '150px' },
          colors: { primary: '#4ECDC4' },
          zoomed: false,
          create: false,
          projects: [],
        },
        global: {
          stubs: {
            teleport: true,
            'v-img': {
              template: '<div class="v-img-stub"></div>',
            },
            Transition: false,
            SvgProjectStamp: {
              template: '<div class="stamp-stub"></div>',
            },
            TaskPreview: {
              template: '<div class="task-preview-stub"></div>',
            },
            HabitPreview: {
              template: '<div class="habit-preview-stub"></div>',
            },
          },
        },
      })

      expect(wrapper.html()).toMatchSnapshot()
    })
  })
})
