<template>
  <v-row dense class="gap-x-2 pl-8 fill-height" style="height: 100%;">
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
      <v-row class="pa-0 w-100 mb-2" style="flex: 1 1 auto; overflow: hidden;">
        <div
          class="w-100 h-100 flex-grow-1"
          style="background-image: url('/svg/wooden2.svg'); background-size: 100% 100%; background-position: center"
        ></div>

        <v-img
          src="svg/old-paper-3.svg"
          alt="Old Paper"
          width="14%"
          class="position-absolute"
          style="top:23%; left: 40.5%;"
          contain
        />
        <svg
          class="position-absolute"
          style="top: 21%; left: 35%; width: 25%; height: auto;"
          viewBox="0 0 300 150"
        >
          <defs>
            <path id="curve" d="M10,90 Q150,10 290,90" fill="transparent"/>
          </defs>
          <text fill="black" font-size="42" font-family="'Irish Grover', cursive" font-weight="600">
            <textPath href="#curve" startOffset="50%" text-anchor="middle">
              Tasks
            </textPath>
          </text>
        </svg>
      </v-row>
    </v-col>
    <v-col cols="3">

    </v-col>
  </v-row>
</template>

<script setup>
  import { ref } from 'vue'
  import { GoalIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon } from 'lucide-vue-next'

  const activeIcon = ref(null)

</script>

