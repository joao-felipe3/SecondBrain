<template>
  <v-col :cols="isMobile ? 12 : 2" class="pa-0 sidebar-outer" :class="{ 'ml-2 mt-n4': !isMobile }">
    <v-col :cols="isMobile ? 12 : 9" class="pa-0">
      <v-container
        fluid
        class="d-flex flex-column align-center justify-center fill-height pa-0 bg-transparent"
      >
        <v-img
          src="logo.svg"
          alt="Logo"
          :width="isMobile ? 80 : 120"
          class="mx-auto mb-1"
          :class="{ 'mt-6': !isMobile, 'mt-2': isMobile }"
          contain
        />
        <h1 
          class="text-center font-weight-bold text-shadow-white"
          :class="isMobile ? 'text-h6' : 'text-h5'"
          style="font-family: 'Irish Grover', cursive;"
        >
          Task RPG
        </h1>

        <v-card elevation="0" class="icon-panel" :class="{ 'icon-panel-mobile': isMobile }">
          <div 
            class="d-flex align-center justify-space-between fill-height py-8"
            :class="isMobile ? 'flex-row px-4' : 'flex-column pl-2 pr-4'"
          >
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

        <!-- Settings Button -->
        <SettingsDialog :userId="userId" @settings-updated="handleSettingsUpdated" />
      </v-container>
    </v-col>
    <v-col v-if="!isMobile" cols="2" />
  </v-col>
</template>

<script setup>
import { GoalIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { computed } from 'vue'
import SvgIconButton from '../ui/svg/IconButton.vue'
import SettingsDialog from '../shared/dialogs/SettingsDialog.vue'

const props = defineProps({
  activeIcon: String,
  isMobile: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['update:activeIcon'])
const router = useRouter()

// Get userId from localStorage or context (assuming it's stored there)
const userId = computed(() => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('userId') || 'default-user'
  }
  return 'default-user'
})

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

function handleSettingsUpdated(settings) {
  console.log('Settings updated:', settings)
  // Emit event or trigger any necessary updates
  emit('settings-updated', settings)
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

.icon-panel-mobile {
  height: auto;
  width: 100%;
  aspect-ratio: unset;
  background-image: none;
  background-color: transparent;
}

/* Narrow sidebar for desktop, full width on mobile */
.sidebar-outer {
  width: 80px;
  max-width: 185px;
  min-width: 64px;
}

@media (max-width: 600px) {
  .sidebar-outer {
    width: 100% !important;
    max-width: none;
    min-width: 0;
  }
}
</style>
