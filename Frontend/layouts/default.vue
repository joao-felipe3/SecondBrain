<template>
    <v-row no-gutters style="height: 100vh;">
        <Sidebar :activeIcon="activeIcon" @update:activeIcon="activeIcon = $event"/>
        <v-col>
            <transition name="slide-page" mode="out-in">
                <slot />
            </transition>
        </v-col>
    </v-row>
</template>

<script setup>
import Sidebar from '../components/Sidebar.vue'
import { ref, onMounted } from 'vue'

const activeIcon = ref('calendar');
</script>

<style>
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

</style>
