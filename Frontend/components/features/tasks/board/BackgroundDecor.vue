<template>
  <client-only>
    <transition name="zoom" appear>
      <div
        :key="zoomed"
        class="background-base"
        :class="{
          'zoomed-bg': zoomed,
          'zoomed-active': zoomed,
          'local-bg': !zoomed
        }"
      />
    </transition>

    <!-- Camada escura ao dar zoom -->
    <transition name="fade" appear>
      <div v-if="zoomed" class="dark-overlay" />
    </transition>

    <!-- Papel decorativo com título -->
    <v-img
      src="svg/old-paper-3.svg"
      alt="Old Paper"
      width="14%"
      class="decor-paper"
      contain
    />

    <svg class="decor-title" viewBox="0 0 300 150">
      <defs> <path id="curve" d="M10,90 Q150,10 290,90" fill="transparent"/> </defs>
      <text fill="black" font-size="40" font-family="'Irish Grover', cursive" font-weight="600">
        <textPath href="#curve" startOffset="50%" text-anchor="middle">
          Tasks
        </textPath>
      </text>
    </svg>

  </client-only>
</template>

<script setup>
  defineProps({
    zoomed: Boolean
  })
</script>

<style scoped>
.dark-overlay {
  position: fixed;
  inset: 0;
  background-color: black;
  opacity: 0.6;
  z-index: 8;
  pointer-events: none;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.7s ease-in-out;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.fade-enter-to, .fade-leave-from {
  opacity: 0.6;
}

.background-base {
  background-image: url('/svg/wooden2.svg');
  background-size: 100% 100%;
  background-position: center;
  position: relative;
  z-index: 1;
}
.local-bg {
  width: 100%;
  height: 100%;
}
.zoomed-bg {
  position: fixed;
  top: 26%;
  left: 17.5%;
  width: 55%;
  height: 72%;
  z-index: 7;
  pointer-events: none;
  overflow: hidden;
}

.zoomed-active {
  transform: translate(8%, -20%) scale(2);
}
.zoom-enter-active, .zoom-leave-active {
  transition: transform 0.7s ease-in-out;
}
.zoom-enter-from, .zoom-leave-to {
  transform: scale(1) translate(0, 0);
}
.zoom-enter-to, .zoom-leave-from {
  transform: translate(8%, -20%) scale(2);
}

.decor-paper {
  position: absolute;
  top: 21.5%;
  left: 38.5%;
  z-index: 10;
}
.decor-title {
  position: absolute;
  top: 19.5%;
  left: 33%;
  width: 25%;
  height: auto;
  z-index: 11;
}
</style>
