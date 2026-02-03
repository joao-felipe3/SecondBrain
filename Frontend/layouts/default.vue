<template>
    <v-layout>
        <!-- Mobile hamburger button -->
        <v-btn
            v-if="isMobile"
            icon
            class="mobile-menu-btn"
            @click="drawerOpen = !drawerOpen"
            elevation="0"
        >
            <Menu :size="28" />
        </v-btn>

        <!-- Desktop Sidebar -->
        <Sidebar 
            v-if="!isMobile"
            :activeIcon="activeIcon" 
            @update:activeIcon="activeIcon = $event"
        />

        <!-- Mobile Navigation Drawer -->
        <v-navigation-drawer
            v-model="drawerOpen"
            temporary
            location="left"
            width="200"
            class="mobile-drawer"
        >
            <Sidebar 
                :activeIcon="activeIcon" 
                @update:activeIcon="handleMobileNav"
                :isMobile="true"
            />
        </v-navigation-drawer>

        <v-main>
            <transition name="slide-page" mode="out-in">
                <div :key="$route.path">
                    <slot />
                </div>
            </transition>
        </v-main>
    </v-layout>
</template>

<script setup>
import { Menu } from 'lucide-vue-next'
import Sidebar from '../components/layout/Sidebar.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'

const activeIcon = ref('calendar')
const drawerOpen = ref(false)
const isMobile = ref(false)

const MOBILE_BREAKPOINT = 960

function checkMobile() {
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
}

function handleMobileNav(iconName) {
    activeIcon.value = iconName
    drawerOpen.value = false
}

onMounted(() => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', checkMobile)
})
</script>

<style>
.mobile-menu-btn {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 1000;
    background: rgba(62, 39, 35, 0.9) !important;
    color: #f5e6d3 !important;
}

.mobile-drawer {
    background: linear-gradient(180deg, #5d4037 0%, #3e2723 100%) !important;
}

.slide-page-enter-active, .slide-page-leave-active {
    transition: transform 0.6s cubic-bezier(.55,0,.1,1), opacity 0.6s cubic-bezier(.55,0,.1,1);
    position: absolute;
    width: 100%;
    top: 0;
    left: 0;
}
.slide-page-enter-from {
    transform: translateX(100%);
    opacity: 0.7;
}
.slide-page-leave-to {
    transform: translateX(-100%);
    opacity: 0.7;
}
.slide-page-enter-to, .slide-page-leave-from {
    transform: translateX(0);
    opacity: 1;
}

html {
    height: 100%;
}

body {
    height: 100%;
}

#__nuxt {
    height: 100%;
}
</style>
