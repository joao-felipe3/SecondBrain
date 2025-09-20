<template>
  <v-col cols="2" class="pa-0 ml-2 mt-n4">
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
        <h1 
          class="text-h4 text-center font-weight-bold text-shadow-white"
          :style="{ fontFamily: 'Irish Grover', cursive }"
        >
          Task RPG
        </h1>

        <v-card elevation="0" class="icon-panel">
          <div class="d-flex flex-column align-center justify-space-between fill-height pl-2 pr-4 py-8">
            <SvgIconButton
              v-for="(icon, index) in sidebarIcons"
              :key="index"
              :icon="icon.icon"
              :name="icon.name"
              :activeIcon="activeIcon"
              @update:active="handleIconClick(icon)"
            />
          </div>
        </v-card>
      </v-container>
    </v-col>
    <v-col cols="2" />
  </v-col>
</template>

<script setup>
import { GoalIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const props = defineProps(['activeIcon'])
const emit = defineEmits(['update:activeIcon'])
const router = useRouter()

const sidebarIcons = [
  { icon: GoalIcon, name: 'goal', route: '/task' },
  { icon: CalendarDaysIcon, name: 'calendar', route: '/projects' },
  { icon: ChartNoAxesCombinedIcon, name: 'graph', route: null }
]

function handleIconClick(icon) {
  emit('update:activeIcon', icon.name)
  if (icon.route) {
    router.push(icon.route)
  }
}
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
