<template>
  <div class="page-container">
    <div class="card large-card">
      <SvgIcon
        name="Card"
        :style="{ width: '100%', height: '100%', color: '#ccc' }"
        fill="#e7e5e5"
        className="svg-background"
      />
      <div class="overlay-title">
        <h1>Tasks</h1>
      </div>
      <div class="content">
        <div>
          <RadioInput
            name="days"
            :options="radioOptions"
            v-model="selected"
            containerWidth="270px"
          />
        </div>
        <div>
          <AtomsIconRadioInput
            :options="[ 
              { value: 'chart-histogram', icon: 'chart-histogram' }, 
              { value: 'bell', icon: 'bell' }, 
              { value: 'settings', icon: 'settings' } 
            ]"
            v-model="selectedOption"
            containerWidth="150px"
          />
        </div>
      </div>
      <div style="margin-top: 1.5rem;" class="tasks-container">
        <TaskProgress :tasks="todayTasks" />
      </div>
      <div class="tasks-container">
        <TaskCard
          v-for="task in todayTasks"
          :key="task.code"
          :task="task"
          :projectColor="task.projectColor"
        />
      </div>
    </div>

    <div class="small-cards-container">
      <div class="card small-card">
        <div class="title">
          <h2>Projects</h2>
        </div>
        <MoleculesProjectList :projects="projects" />
      </div>
      <div class="card small-card">
        <Calendar />
      </div>
    </div>
  </div>
</template>

<script>
  import SvgIcon from '~/components/Atoms/SvgIcon.vue';
  import RadioInput from '~/components/Atoms/RadioInput.vue';
  import Calendar from '~/components/Atoms/Calendar.vue';
  import TaskCard from '~/components/Molecules/TaskCard.vue'; // Componente do card de tarefa
  import TaskProgress from '~/components/Molecules/TaskProgress.vue'

  export default {
    name: 'TaskPage',
    components: {
      SvgIcon,
      RadioInput,
      Calendar,
      TaskCard,
      TaskProgress,
    },
    data() {
      return {
        selected: null,
        radioOptions: [
          { label: 'Today', value: 'today' },
          { label: 'Tomorrow', value: 'tomorrow' },
          { label: 'Week', value: 'week' },
          { label: 'Planned', value: 'planned' },
        ],
        tasks: [
          {
            code: 'T1',
            name: 'Do the UI/UX of the website',
            description: 'Completar o relatório semanal',
            deadline: new Date(),
            pomodorosPlanned: 2,
            pomodorosDid: 1,
            priority: 'Alta',
            difficult: 'Média',
            project: 'P1',
            experience: 50,
            isConcluded: false,
            late: false,
            prize: 10,
            frequency: 'Daily'
          },
          {
            code: 'T2',
            name: 'Start to do the frontend',
            description: 'Revisar o código da aplicação',
            deadline: new Date(),
            pomodorosPlanned: 4,
            pomodorosDid: 3,
            priority: 'Média',
            difficult: 'Alta',
            project: 'P2',
            experience: 30,
            isConcluded: false,
            late: true,
            prize: 15,
            frequency: 'Monthly'
          },
          {
            code: 'T3',
            name: 'Study to Calculus III exam',
            description: 'Revisar o código da aplicação',
            deadline: new Date(),
            pomodorosPlanned: 5,
            pomodorosDid: 3,
            priority: 'Média',
            difficult: 'Alta',
            project: 'P3',
            experience: 30,
            isConcluded: false,
            late: true,
            prize: 15,
            frequency: 'Monthly'
          },
        ],
        projects: [
          {
            code: "P1",
            name: "Website Redesign",
            color: "#FF5733", // Laranja
            totalHoursWorked: 120, // Adicionado
          },
          {
            code: "P2",
            name: "Backend Development",
            color: "#33FF57", // Verde
            totalHoursWorked: 200, // Adicionado
          },
          {
            code: "P3",
            name: "Mobile App",
            color: "#3357FF", // Azul
            totalHoursWorked: 90, // Adicionado
          },
          {
            code: "P4",
            name: "Data Analysis",
            color: "#FFC300", // Amarelo
            totalHoursWorked: 75,
          },
          {
            code: "P6",
            name: "DevOps Automation",
            color: "#C70039", // Vermelho
            totalHoursWorked: 180,
          },
          {
            code: "P7",
            name: "AI Model Training",
            color: "#1ABC9C", // Verde água
            totalHoursWorked: 140,
          },
        ],
      };
    },
    computed: {
      todayTasks() {
        const today = new Date().toISOString().split('T')[0];
        return this.tasks
          .filter((task) => task.deadline.toISOString().split('T')[0] === today)
          .map((task) => ({
            ...task,
            projectColor: this.projects.find((p) => p.code === task.project)?.color || '#CCCCCC', // Cor do projeto ou cinza padrão
          }));
      },
    },
  };
</script>

<style scoped>
  .page-container {
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    height: calc(100vh - 1.35rem); /* Subtrai o valor do margin-top */
    box-sizing: border-box;
    gap: 1.5rem; /* Espaçamento entre o card grande e o contêiner dos pequenos */
    margin-top: 1.35rem;
    margin-right: 1.5rem;
  }

  .card {
    border: 1px solid #ccc;
    border-radius: 50px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    background-color: #e7e5e5;
    padding: 0.5rem;
    box-sizing: border-box;
    position: relative;
  }

  .overlay-title {
    position: absolute;
    top: -1%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    text-align: center;
    background: var(--gradient-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .title {
    padding-bottom: 0.5rem;
    text-align: center;
    background: var(--gradient-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .overlay-title h1 {
    font-size: 3rem;
    font-weight: 700;
    margin: 0;
    padding: 0;
  }

  .large-card {
    width: 63vw;
    height: 93vh;
    position: relative;
    overflow: hidden;
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .large-card .svg-background {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 0;
  }

  .large-card .content {
    position: relative;
    z-index: 1;
    padding-left: 1.5rem;
    padding-top: 0.75rem;
    display: flex;
    gap: 260px; /* Controla o espaçamento entre os itens */
    align-items: left;
  }

  .large-card .content > div {
    flex-shrink: 0;
  }

  .large-card .tasks-container {
    position: relative;
    z-index: 1;
    padding: 0 1rem;
    margin-top: 1rem;
    align-items: left;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(45%, 1fr));
    gap: 1rem;
  }

  /* Contêiner dos cards pequenos */
  .small-cards-container {
    display: flex;
    flex-direction: column; /* Alinha os cards pequenos em coluna */
    gap: 1.5rem; /* Espaçamento entre os cards pequenos */
  }

  .small-card {
    width: 20vw;
    height: 45vh; /* Define altura para cada card pequeno */
    display: flex; /* Ativa o flexbox */
    flex-direction: column; /* Garante que os itens sejam empilhados verticalmente */
    justify-content: flex-start; /* Alinha os itens verticalmente ao centro */
    align-items: center; /* Alinha os itens horizontalmente ao centro */
    box-sizing: border-box; /* Inclui padding na altura/largura */
    padding-left: 0.25rem;
    padding-right: 0.25rem;
  }

  .small-card title {
    background: var(--gradient-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
</style>
