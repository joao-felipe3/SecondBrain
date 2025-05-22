<template>
  <v-row dense class="gap-x-2 px-8 fill-height" style="height: 100%;">
    <v-col cols="2" class="pa-0">
      <v-col cols="9" class="pa-0">
        <v-container
          fluid
          class="d-flex flex-column align-center justify-center fill-height pa-0"
          style="background-color: transparent;"
        >
          <v-img
            src="logo.svg"
            alt="Logo"
            width="120"
            class="mx-auto mt-6 mb-1"
            contain
          />
          <h1
            class="text-h4 text-center font-weight-bold text-shadow-white"
            style="font-family: 'Poppins', sans-serif;"
          >
            Tatapp
          </h1>

          <v-card
            elevation="0"
            class="d-flex flex-column align-center justify-center text-white mt-4"
            style="
              background-image: url('/svg/sign.svg');
              background-size: 100% 100%;
              background-position: center;
              background-repeat: no-repeat;
              background-color: transparent;
              height: 65vh;
              width: auto;
              aspect-ratio: 222 / 660;
            "
          >
            <div class="d-flex flex-column align-center justify-space-between fill-height pl-2 pr-4 py-8">
              <SvgIconButton
                :icon="GoalIcon"
                name="goal"
                :activeIcon="activeIcon"
                @update:active="activeIcon = $event"
              >
              </SvgIconButton>

              <SvgIconButton
                :icon="CalendarDaysIcon"
                name="calendar"
                :activeIcon="activeIcon"
                @update:active="activeIcon = $event"
              >

              </SvgIconButton>

              <SvgIconButton
                :icon="ChartNoAxesCombinedIcon"
                name="graph"
                :activeIcon="activeIcon"
                @update:active="activeIcon = $event"
              >
              </SvgIconButton>

            </div>
          </v-card>
        </v-container>
      </v-col>
      <v-col cols="3"></v-col>
    </v-col>
    <v-col cols="7" class="height-100 d-flex flex-column">
      <v-row class="pa-0" style="flex: 0 0 auto">
         <TaskStatsCard />
      </v-row>
      <v-row class="pa-0 w-100 mb-2 mt-4" style="flex: 1 1 auto; overflow: hidden;">
        <BackgroundDecor />
        <TaskBoard :tasks="tasks" :projects="projects" />
        <CreateTaskButton />
      </v-row>
    </v-col>
    <v-col cols="3" class="py-1 d-flex flex-column justify-center" style="height: 100vh;">
      <ProjectList :projects="projects" />
      <WoodPanel title="Calendar" :titleOffset="'-9%'" :contentStyle="{ top: '-12%', left: '13.5%' }">
        <Calendar />
      </WoodPanel>
    </v-col>
  </v-row>
</template>

<script setup>
  import { ref } from 'vue'
  import { GoalIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon } from 'lucide-vue-next'

  const activeIcon = ref(null)
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);


  const tasks = [
    {
      code: 'T1',
      name: 'Do the UI/UX of the website',
      description: 'Completar o relatório semanal',
      deadline: today,
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
      deadline: yesterday,
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
      deadline: tomorrow,
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
    {
      code: 'T4',
      name: 'Say I love you to my gf',
      description: 'Ela é muito linda e eu amo muito ela',
      deadline: tomorrow,
      pomodorosPlanned: 5,
      pomodorosDid: 4,
      priority: 'Média',
      difficult: 'Alta',
      project: 'P4',
      experience: 40,
      isConcluded: false,
      late: true,
      prize: 25,
      frequency: 'Monthly'
    },
    {
      code: 'T5',
      name: 'Finish this sh*t of task',
      description: 'Eu só quero terminar logo isso',
      deadline: tomorrow,
      pomodorosPlanned: 5,
      pomodorosDid: 5,
      priority: 'Média',
      difficult: 'Alta',
      project: 'P3',
      experience: 100,
      isConcluded: false,
      late: true,
      prize: 45,
      frequency: 'Monthly'
    }
  ]

  const projects = [
    { code: "P1", name: "Website Redesign", color: "#FF5733", totalHoursWorked: 120 },
    { code: "P2", name: "Backend Development", color: "#33FF57", totalHoursWorked: 200 },
    { code: "P3", name: "Mobile App", color: "#3357FF", totalHoursWorked: 90 },
    { code: "P4", name: "Data Analysis", color: "#FFC300", totalHoursWorked: 75 },
    { code: "P6", name: "DevOps Automation", color: "#C70039", totalHoursWorked: 180 },
    { code: "P7", name: "AI Model Training", color: "#1ABC9C", totalHoursWorked: 140 },
  ]

</script>

