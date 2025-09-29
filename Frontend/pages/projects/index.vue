<template>
    <v-row dense class="gap-x-2 ml-n6" style="min-height: 100vh;">
      <v-col cols="6" class="d-flex align-center justify-center" style="min-height: 100vh;">
        <ProjectPanel
          title="Projetos"
          :titleOffset="'-10%'"
          :contentStyle="{ minHeight: '70vh' }"
          :projects="mockProjects"
          @project-hover="onProjectHover"
        />
      </v-col>
      <v-col cols="6" class="d-flex flex-column align-start position-relative">
        <div style="width: 100%; padding-left: 5%;">
          <BookShelf class="bookshelf-squashed" :projectColors="projectColors" :hoveredProjectIndex="hoveredProjectIndex" />
        </div>
        <div class="book-container">
          <Book class="book-bottom" />
        </div>
      </v-col>
    </v-row>
</template>

<script setup>
import { computed, ref } from 'vue'

import ProjectPanel from '../../components/ProjectPanel.vue'
import Book from '../../components/Svg/Book.vue'
import BookShelf from '../../components/Svg/BookShelf.vue'

// Estado para controlar qual projeto está em hover
const hoveredProjectIndex = ref(-1)

// Função para lidar com hover de projetos
const onProjectHover = (projectIndex) => {
  hoveredProjectIndex.value = projectIndex
}

const mockProjects = [
  {
    _id: "1",
    name: "Sistema de Gerenciamento",
    description: "Plataforma gamificada para organizar tarefas e hábitos.",
    color: "#3EFF88",
    startDate: new Date("2025-01-10"),
    deadline: new Date("2026-04-30"),
    totalHoursWorked: 120.5,
    plannedHours: 200,
    shortTermGoal: "Implementar CRUD de tarefas",
    midTermGoal: "Integrar com calendário e sistema de recompensas",
    longTermGoal: "Lançar versão beta para usuários",
    status: "Em andamento",
    progressPercentage: 60.25,
    experience: 150,
    reward: 300
  },
  {
    _id: "2",
    name: "IA Financeira",
    description: "Desenvolver modelos preditivos para análise de crédito.",
    color: "#C64CFF",
    startDate: new Date("2024-11-01"),
    deadline: new Date("2026-06-15"),
    totalHoursWorked: 80,
    plannedHours: 300,
    shortTermGoal: "Levantar base de dados",
    midTermGoal: "Treinar modelos de classificação",
    longTermGoal: "Publicar artigo em conferência internacional",
    status: "Planejamento",
    progressPercentage: 26.6,
    experience: 100,
    reward: 250
  },
  {
    _id: "3",
    name: "Intercâmbio em Montreal",
    description: "Preparar documentação, cursos e plano de viagem.",
    color: "#FFD13B",
    startDate: new Date("2025-02-01"),
    deadline: new Date("2026-06-01"),
    totalHoursWorked: 45.75,
    plannedHours: 100,
    shortTermGoal: "Organizar visto e moradia",
    midTermGoal: "Ajustar grade curricular",
    longTermGoal: "Aproveitar disciplinas e experiências culturais",
    status: "Em andamento",
    progressPercentage: 45.75,
    experience: 80,
    reward: 150
  },
  {
    _id: "4",
    name: "Trabalho de Redes",
    description: "Projeto físico-lógico de rede com segurança e cabeamento estruturado.",
    color: "#FF3030",
    startDate: new Date("2025-03-01"),
    deadline: new Date("2026-05-20"),
    totalHoursWorked: 10,
    plannedHours: 60,
    shortTermGoal: "Modelar topologia física",
    midTermGoal: "Configurar VLANs e roteadores",
    longTermGoal: "Entregar documentação completa",
    status: "Não iniciado",
    progressPercentage: 16.6,
    experience: 60,
    reward: 120
  },
  {
    _id: "5",
    name: "Estudar Francês",
    description: "Estudo fonético detalhado com várias palavras.",
    color: "#49F9FF",
    startDate: new Date("2025-03-01"),
    deadline: new Date("2026-05-20"),
    totalHoursWorked: 20,
    plannedHours: 120,
    shortTermGoal: "Modelar topologia física",
    midTermGoal: "Configurar VLANs e roteadores",
    longTermGoal: "Entregar documentação completa",
    status: "Não iniciado",
    progressPercentage: 28.6,
    experience: 40,
    reward: 80
  }
]

// Extrair as cores dos projetos
const projectColors = computed(() => 
  mockProjects.map(project => project.color)
)

</script>

<style scoped>
.bookshelf-squashed {
  width: 90%;
  height: 44vh;
  /* Força o SVG a ignorar proporções originais */
  display: block;
}

.bookshelf-squashed svg {
  width: 100% !important;
  height: 100% !important;
}

.book-container {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding-left: 5%;
  padding-right: 5%;
  /* Invade um pouco o espaço do BookShelf */
  bottom: -2vh;
}

.book-bottom {
  width: 100%;
  height: 100%;
  /* Remove qualquer margem */
  margin: 0;
}

.book-bottom svg {
  width: 100% !important;
  height: 100% !important;
}
</style>
