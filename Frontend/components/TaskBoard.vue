<template>
  <div class="position-absolute mt-10" style="width: 100%; height: 60%; margin-left: -7%;">
    <TaskPaper
      v-for="(task, index) in tasks"
      :key="task.code"
      :task="task"
      :colors="getProjectColors(task.project)"
      :positionStyle="getTaskPositionStyle(index)"
    />
  </div>
</template>

<script setup>
import TaskPaper from './TaskPaper.vue'
const { tasks, projects } = defineProps(['tasks', 'projects']);

const getProjectColors = (projectCode) => {
  const project = projects.find(p => p.code === projectCode);
  if (!project) return null;

  let main = project.color;

  const adjustColor = (hex, amount) => {
    return "#" + hex.replace(/^#/, "")
      .match(/.{2}/g)
      .map(c => {
        const v = Math.min(255, Math.max(0, parseInt(c, 16) + amount));
        return v.toString(16).padStart(2, '0');
      })
      .join('');
  };

  const light = main;
  const dark = adjustColor(main, -80);
  main = adjustColor(main, -40);

  return { main, light, dark };
};


const getTaskPositionStyle = (index) => {
  const itemsPerRow = 3

  const row = Math.floor(index / itemsPerRow)
  const col = index % itemsPerRow

  const baseTop = -1      // porcentagem
  const baseLeft = 10    // porcentagem
  const gapX = 19        // espaçamento horizontal entre tasks
  const gapY = 42        // espaçamento vertical entre linhas

  const offset = (row % 2) * (gapX / 2) // só desloca linhas ímpares

  const top = baseTop + row * gapY
  const left = baseLeft + col * gapX + offset

  return {
    position: 'absolute',
    top: `${top}%`,
    left: `${left}%`
  }
}

</script>
