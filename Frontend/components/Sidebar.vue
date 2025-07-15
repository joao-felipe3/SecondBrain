<template>
  <v-col cols="2" class="pa-0">
    <v-col cols="9" class="pa-0">
      <v-container
        fluid
        class="d-flex flex-column align-center justify-center fill-height pa-0 bg-transparent"
      >
        <v-img
          src="logo.svg"
          alt="Logo"
          width="120"
          class="mx-auto mt-6 mb-1"
          contain
        />
        <h1 class="text-h4 text-center font-weight-bold text-shadow-white font-poppins">
          TaskRPG
        </h1>

        <v-card elevation="0" class="icon-panel">
          <div class="d-flex flex-column align-center justify-space-between fill-height pl-2 pr-4 py-8">
            <SvgIconButton
              v-for="(icon, index) in sidebarIcons"
              :key="index"
              :icon="icon.icon"
              :name="icon.name"
              :activeIcon="activeIcon"
              @update:active="$emit('update:activeIcon', $event)"
            />
          </div>
        </v-card>
      </v-container>
    </v-col>
    <v-col cols="3" />
  </v-col>
</template>

<script setup>
import { GoalIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon } from 'lucide-vue-next'
defineProps(['activeIcon'])
defineEmits(['update:activeIcon'])

const sidebarIcons = [
  { icon: GoalIcon, name: 'goal' },
  { icon: CalendarDaysIcon, name: 'calendar' },
  { icon: ChartNoAxesCombinedIcon, name: 'graph' }
]
</script>

<style scoped>
.font-poppins {
  font-family: 'Poppins', sans-serif;
}

.bg-transparent {
  background-color: transparent;
}

.icon-panel {
  background-image: url('/svg/sign.svg');
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  background-color: transparent;
  height: 65vh;
  width: auto;
  aspect-ratio: 222 / 660;
}
</style>
