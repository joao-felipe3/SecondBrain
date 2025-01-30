<template>
  <div class="task-progress-container">
    <!-- Card "Left to Do" -->
    <div class="card progress-card left-to-do">
      <h2 class="title"">Left to Do</h2>
      <div class="progress-details">
        <div class="progress-item">
          <p class="large-number">{{ totalPomodorosRemaining }}</p>
          <p class="subtitle">Pomodoros Restantes</p>
        </div>
        <div class="progress-item">
          <p class="large-number">
            {{ formatTime(totalTimeRemaining).hours }}
            <span class="unit">h</span>
            {{ formatTime(totalTimeRemaining).minutes }}
            <span class="unit">min</span>
          </p>
          <p class="subtitle">Tempo Restante</p>
        </div>
      </div>
    </div>

    <!-- Card "Already Done" -->
    <div class="card progress-card already-done">
      <h2 class="title">Already Done</h2>
      <div class="progress-details">
        <div class="progress-item">
          <p class="large-number">{{ totalPomodorosDone }}</p>
          <p class="subtitle">Pomodoros Concluídos</p>
        </div>
        <div class="progress-item">
          <p class="large-number">
            {{ formatTime(totalTimeSpent).hours }}
            <span class="unit">h</span>
            {{ formatTime(totalTimeSpent).minutes }}
            <span class="unit">min</span>
          </p>
          <p class="subtitle">Tempo Gasto</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TaskProgress',
  props: {
    tasks: {
      type: Array,
      required: true
    }
  },
  computed: {
    totalPomodorosDone() {
      return this.tasks.reduce((sum, task) => sum + task.pomodorosDid, 0);
    },
    totalPomodorosRemaining() {
      return this.tasks.reduce((sum, task) => sum + (task.pomodorosPlanned - task.pomodorosDid), 0);
    },
    totalTimeSpent() {
      return this.totalPomodorosDone * 25; // Cada pomodoro tem 25 minutos
    },
    totalTimeRemaining() {
      return this.totalPomodorosRemaining * 25; // Cada pomodoro tem 25 minutos
    },
  },
  methods: {
     /**
     * Converte o tempo em minutos para um objeto com horas e minutos.
     * @param {number} minutes - Tempo em minutos.
     * @returns {object} - Objeto com horas e minutos separados.
     */
    formatTime(minutes) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return { hours, minutes: remainingMinutes };
    },
  }
}
</script>

<style scoped>
.task-progress-container {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.title{
  margin-left: 0.5rem;
  font-size: 1.5rem;
  color: #575757;
}

.progress-card {
  width: 48%;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  background-color: #f9f9f9;
  border-radius: 2rem;
}

.left-to-do {
  background-color: #CBCBCB; /* Amarelo */
}

.already-done {
  background-color: #CBCBCB; /* Verde */
}

.progress-details {
  display: flex;
  justify-content: space-between;
  margin: 0 1.5rem;
  margin-top: -0.25rem;
  padding: 0;
}

.progress-item {
  text-align: center;
}

.large-number {
  font-size: 36px;
  font-weight: bold;
  color: #333;
}

.subtitle {
  font-weight: 300;
  font-size: 0.75rem;
  color: #575757;
}

.progress-item p {
  margin: 0px 0;
}

.unit {
  font-size: 18px;
  font-weight: normal;
  color: #666;
  margin-left: -0.25rem;
}
</style>
