// Task components barrel file
// Layout components (page structure)
export { default as TaskMain } from './layout/Main.vue'
export { default as TaskSidebar } from './layout/Sidebar.vue'

// Board components (task board/grid)
export { default as TaskBoard } from './board/Board.vue'
export { default as TaskPaper } from './board/Paper.vue'
export { default as TaskCard } from './board/Card.vue'
export { default as TaskPreview } from './board/TaskPreview.vue'
export { default as TaskZoomedContent } from './board/ZoomedContent.vue'
export { default as TaskStatsCard } from './board/StatsCard.vue'
export { default as TaskBackgroundDecor } from './board/BackgroundDecor.vue'

// Kanban (Sprint 4)
export { default as TaskKanbanBoard } from './kanban/KanbanBoard.vue'

// Widget components (reusable widgets)
export { default as TaskCalendar } from './widgets/Calendar.vue'
export { default as TaskProjectList } from './widgets/ProjectList.vue'

// Form components
export { default as TaskForm } from './forms/TaskForm.vue'
