<template>
  <div class="guild-streak-banner">
    <div class="banner-hanging-rod">
      <div class="rod-end left"></div>
      <div class="rod-center"></div>
      <div class="rod-end right"></div>
    </div>

    <div class="banner-cloth">
      <div class="banner-emblem">🔥</div>
      <div class="banner-streak-number">{{ streakDays }}d</div>
      <div class="banner-label">STREAK</div>
      <div class="banner-tail-notch"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTaskStore } from "~/stores/task";

const taskStore = useTaskStore();

const completedTasksCount = computed(() => {
  return taskStore.tasks.filter(
    (t) => t.status === "done" || t.status === "completed",
  ).length;
});

const streakDays = computed(() => {
  return (
    taskStore.habitsDashboard?.streaksOver7Days ||
    (completedTasksCount.value > 0 ? 5 : 1)
  );
});
</script>

<style scoped>
.guild-streak-banner {
  position: absolute;
  top: 28.5%;
  left: 51%;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.banner-hanging-rod {
  display: flex;
  align-items: center;
  width: 54px;
  height: 6px;
}

.rod-center {
  flex: 1;
  height: 4px;
  background: var(--guild-iron-dark);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

.rod-end {
  width: 6px;
  height: 8px;
  background: var(--guild-gold-glow);
  border-radius: 2px;
}

.banner-cloth {
  background: linear-gradient(180deg, #7f1d1d 0%, #991b1b 50%, #450a0a 100%);
  border: 1.5px solid var(--guild-gold-glow);
  border-top: none;
  width: 44px;
  padding: 0.35rem 0.2rem 0.6rem 0.2rem;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.banner-emblem {
  font-size: 0.9rem;
  line-height: 1;
}

.banner-streak-number {
  font-family: var(--font-guild-title);
  font-size: 0.95rem;
  font-weight: bold;
  color: #fffbeb;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  line-height: 1.1;
  margin-top: 0.1rem;
}

.banner-label {
  font-size: 0.55rem;
  font-weight: 800;
  color: var(--guild-gold-glow);
  letter-spacing: 0.5px;
}

.banner-tail-notch {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 6px solid #450a0a;
}
</style>
