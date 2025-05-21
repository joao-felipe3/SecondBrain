<template>
  <div class="calendar">
    <div class="calendar-header">
      <button @click="prevMonth">◀</button>
      <h3>{{ monthNames[currentMonth] }} {{ currentYear }}</h3>
      <button @click="nextMonth">▶</button>
    </div>
    <div class="calendar-body">
      <div class="day-names">
        <span v-for="day in dayNames" :key="day">{{ day }}</span>
      </div>
      <div class="days">
        <span
          v-for="day in blankDays"
          :key="'blank-' + day"
          class="day blank"
        ></span>
        <span
          v-for="day in daysInMonth"
          :key="'day-' + day"
          class="day"
          :class="{ today: isToday(day) }"
        >
          {{ day }}
        </span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "Calendar",
  data() {
    const today = new Date();
    return {
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth(),
      selectedDate: today,
      dayNames: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      monthNames: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
    };
  },
  computed: {
    daysInMonth() {
      return new Date(
        this.currentYear,
        this.currentMonth + 1,
        0
      ).getDate();
    },
    firstDayOfMonth() {
      return new Date(this.currentYear, this.currentMonth, 1).getDay();
    },
    blankDays() {
      return Array.from({ length: this.firstDayOfMonth }, (_, i) => i + 1);
    },
  },
  methods: {
    prevMonth() {
      if (this.currentMonth === 0) {
        this.currentMonth = 11;
        this.currentYear--;
      } else {
        this.currentMonth--;
      }
    },
    nextMonth() {
      if (this.currentMonth === 11) {
        this.currentMonth = 0;
        this.currentYear++;
      } else {
        this.currentMonth++;
      }
    },
    isToday(day) {
      const today = new Date();
      return (
        day === today.getDate() &&
        this.currentMonth === today.getMonth() &&
        this.currentYear === today.getFullYear()
      );
    },
  },
};
</script>

<style scoped>
.calendar {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 10px;
  padding-top: 0.5rem; /* Reduzido */
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  font-family: Arial, sans-serif;
  width: 100%; /* Ajusta ao contêiner pai */
  max-width: 240px; /* Reduz largura máxima */
  color: white;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 0.5rem; /* Reduzido */
}

.calendar-header h3 {
  margin: 0;
  font-size: 0.9rem; /* Tamanho menor */
}

.calendar-header button {
  background-color: transparent;
  border: none;
  border-radius: 5px;
  padding: 0.3rem 0.6rem; /* Botões menores */
  cursor: pointer;
  font-size: 0.8rem; /* Texto menor nos botões */
}

.calendar-body {
  width: 100%;
}

.day-names {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 0.3rem; /* Reduzido */
  font-size: 0.8rem; /* Texto menor */
}

.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  gap: 0.2rem; /* Espaço entre dias reduzido */
}

.day {
  padding: 0.3rem; /* Reduzido */
  font-size: 0.8rem; /* Texto menor */
  border-radius: 50%; /* Ajustado */
}

.day.today {
  background: #aaa; /* Gradiente de fundo */
  color: black; /* Texto permanece branco */
  border-radius: 50%; /* Garante que o fundo seja circular */
  width: 25px; /* Ajuste para o tamanho desejado */
  height: 25px; /* Ajuste para o tamanho desejado */
  font-weight: bold; /* Destaca o texto */
  display: flex; /* Usa flexbox para alinhar o conteúdo */
  align-items: center; /* Alinha o texto verticalmente */
  justify-content: center; /* Alinha o texto horizontalmente */
  margin: auto; /* Garante que o círculo esteja centralizado */
  box-sizing: border-box; /* Garante que padding e borda sejam considerados no tamanho */
}

.day.blank {
  visibility: hidden;
}
</style>