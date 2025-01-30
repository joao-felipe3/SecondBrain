<template>
  <div class="task-card">
    <div
      class="task-frequency-label"
      :style="{ backgroundColor: projectColor }"
    >
      {{ task.frequency }}
    </div>
    <input
      type="checkbox"
      class="checkbox"
      v-model="task.isConcluded"
      :style="{ border: `1px solid ${projectColor}` }"
    />
    <button class="play-button" @click="startTask"></button>
    <div>
      <p 
        :class="['task-label', { concluded: task.isConcluded }]" 
        :style="{ color: darkenedProjectColor }"
      >
        {{ task.name }}
      </p>
      <div class="task-details">
        <div class="pomodoros">
          <template v-for="n in task.pomodorosPlanned" :key="n">
            <img
              src="~/assets/img/tomato.png"
              alt="Pomodoro"
              :class="['tomato-icon', { 'not-done': n > task.pomodorosDid }]"
            />
          </template>
          <div class="rewards">
            <div class="reward" style="color: #E39200;">
              <img
                src="~/assets/img/coins.png"
                alt="Prize"
                class="reward-icon"
              />
              <span>{{ task.prize }}</span>
            </div>
            <div class="reward" style="color: #56A300;">
              <img
                src="~/assets/img/level.png"
                alt="Experience"
                class="reward-icon"
              />
              <span>{{ task.experience }} EXP</span>
            </div>
          </div>
          <div 
            class="deadline" 
            :class="{ 'deadline-passed': isDeadlinePassed }"
          >
            <AtomsSvgIcon
              name="calendar-week"
              :style="{
                width: '16px',
                height: '16px',
                color: isDeadlinePassed ? 'red' : '#414856',
                strokeWidth: '2'
              }"
            />
            <span class="deadline-text">{{ formattedDeadline }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    task: {
      type: Object,
      required: true,
    },
    projectColor: {
      type: String,
      default: "#CCCCCC", // Cor padrão
    },
  },
  computed: {
    formattedDeadline() {
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      const taskDeadline = new Date(this.task.deadline);
      taskDeadline.setHours(0, 0, 0, 0); // Zera as horas para comparar apenas a data

      today.setHours(0, 0, 0, 0);

      if (taskDeadline < today) {
        return "LATE";
      } else if (taskDeadline.getTime() === today.getTime()) {
        return "Today";
      } else if (taskDeadline.getTime() === tomorrow.getTime()) {
        return "Tomorrow";
      } else {
        // Formata a data normalmente
        const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
        return taskDeadline.toLocaleDateString('pt-BR', options);
      }
    },
    isDeadlinePassed() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const taskDeadline = new Date(this.task.deadline);
      taskDeadline.setHours(0, 0, 0, 0);
      return taskDeadline <= today;
    },
    darkenedProjectColor() {
      return this.darkenColor(this.projectColor, 20); // Escurece 20%
    },
  },
  methods: {
    startTask() {
      console.log('Task started:', this.task.name);
    },
    darkenColor(color, percent) {
      // Remove o '#' inicial, se existir
      let hex = color.replace('#', '');

      // Converte para RGB
      let r = parseInt(hex.substring(0, 2), 16);
      let g = parseInt(hex.substring(2, 4), 16);
      let b = parseInt(hex.substring(4, 6), 16);

      // Reduz a luminosidade de cada canal RGB
      r = Math.round(r * (1 - percent / 100));
      g = Math.round(g * (1 - percent / 100));
      b = Math.round(b * (1 - percent / 100));

      // Garante que os valores estão no intervalo [0, 255]
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      // Converte de volta para hexadecimal
      const darkenedColor = `#${((1 << 24) + (r << 16) + (g << 8) + b)
        .toString(16)
        .slice(1)}`;
      return darkenedColor;
    }
  }
};
</script>


<style scoped>
.task-card {
  position: relative;
  border: 1px solid #ccc;
  border-radius: 2rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
  background-color: #CBCBCB;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
}

.task-frequency-label {
  position: absolute; /* Trabalha no fluxo sem sair do contêiner */
  display: inline-block;
  margin-top: -5.25rem;
  margin-left: 1rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 0.2rem;
  padding-bottom: 0.2rem;
  color: #fff;
  font-size: 0.75rem;
  font-weight: bold;
  border-radius: 20px;
  background-color: var(--label-color, #ccc); /* Cor dinâmica */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 2;
}

.checkbox {
  appearance: none;
  height: 30px;
  width: 30px;
  margin-right: 0.5rem;
  border: 1px solid #666;
  border-radius: 50%;
  position: relative;
  cursor: pointer;
  background-color: #e7e5e5;
}

.checkbox:checked {
  background-color: #88FF88;
  border-color: #00D12D;
}

.checkbox:checked::before {
  content: "";
  position: absolute;
  top: 6px;
  left: 9px;
  width: 6px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.play-button {
  height: 30px;
  width: 30px;
  margin-right: 0.75rem;
  border-width: 1px;
  border-radius: 50%;
  background-color: #DB9E8E;
  border-color: #FF3501;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.play-button::before {
  content: "";
  display: inline-block;
  width: 0;
  height: 0;
  margin-left: 3px;
  border-style: solid;
  border-width: 6px 0 6px 10px;
  border-color: transparent transparent transparent #FF3501;
}

.task-label {
  font-weight: 500;
  color: #000;
  transition: color 0.3s, text-decoration 0.3s;
}

.task-label.concluded {
  color: #606060;
  text-decoration: line-through;
}

.task-details span {
  display: block;
}

.pomodoros {
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
}

.pomodoros span {
  font-size: 13px;
}

.tomato-icon {
  width: 13px;
  height: 13px;
  margin-right: 0.25rem;
}

.tomato-icon.not-done {
  opacity: 0.4;
}

.deadline {
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
}

.deadline-text {
  font-size: 14px;
  color: #414856;
}

.deadline-passed .deadline-text {
  color: red;
  font-weight: 600;
}

.rewards {
  display: flex;
  align-items: center;
  margin-left: 10px;
  gap: 10px;
}

.reward {
  display: flex;
  align-items: center;
  font-weight: 700;
  font-size: 15px;
  gap: 5px;
}

.reward-icon {
  width: 17px;
  height: 17px;
}
</style>
