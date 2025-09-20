<template>
    <v-row dense class="gap-x-2 ml-n6" style="min-height: 100vh;">
      <v-col cols="6" class="d-flex align-center justify-center" style="min-height: 100vh;">
        <ProjectPanel title="Projetos" :titleOffset="'-10%'" :contentStyle="{ minHeight: '70vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }">
          <!-- Conteúdo do painel pode ser adicionado aqui -->
        </ProjectPanel>
      </v-col>
      <v-col cols="6">
        <!-- Espaço para conteúdo futuro -->
      </v-col>
    </v-row>
</template>

<script setup>

import ProjectPanel from '../../components/ProjectPanel.vue'

const mockProjects: Project[] = [
  {
    _id: "1",
    name: "Sistema de Gerenciamento de Tarefas",
    description: "Plataforma gamificada para organizar tarefas e hábitos.",
    color: "#4CAF50",
    startDate: new Date("2025-01-10"),
    deadline: new Date("2025-04-30"),
    totalHoursWorked: 120.5,
    plannedHours: 200,
    shortTermGoal: "Implementar CRUD de tarefas",
    midTermGoal: "Integrar com calendário e sistema de recompensas",
    longTermGoal: "Lançar versão beta para usuários",
    status: "Em andamento",
    progressPercentage: 60.25
  },
  {
    _id: "2",
    name: "Projeto de Pesquisa - IA Financeira",
    description: "Desenvolver modelos preditivos para análise de crédito.",
    color: "#2196F3",
    startDate: new Date("2024-11-01"),
    deadline: new Date("2025-06-15"),
    totalHoursWorked: 80,
    plannedHours: 300,
    shortTermGoal: "Levantar base de dados",
    midTermGoal: "Treinar modelos de classificação",
    longTermGoal: "Publicar artigo em conferência internacional",
    status: "Planejamento",
    progressPercentage: 26.6
  },
  {
    _id: "3",
    name: "Intercâmbio em Montreal",
    description: "Preparar documentação, cursos e plano de viagem.",
    color: "#FF9800",
    startDate: new Date("2025-02-01"),
    deadline: new Date("2025-06-01"),
    totalHoursWorked: 45.75,
    plannedHours: 100,
    shortTermGoal: "Organizar visto e moradia",
    midTermGoal: "Ajustar grade curricular",
    longTermGoal: "Aproveitar disciplinas e experiências culturais",
    status: "Em andamento",
    progressPercentage: 45.75
  },
  {
    _id: "4",
    name: "Trabalho Final de Redes",
    description: "Projeto físico-lógico de rede com segurança e cabeamento estruturado.",
    color: "#9C27B0",
    startDate: new Date("2025-03-01"),
    deadline: new Date("2025-05-20"),
    totalHoursWorked: 10,
    plannedHours: 60,
    shortTermGoal: "Modelar topologia física",
    midTermGoal: "Configurar VLANs e roteadores",
    longTermGoal: "Entregar documentação completa",
    status: "Não iniciado",
    progressPercentage: 16.6
  }
]

</script>

<style scoped>

</style>
