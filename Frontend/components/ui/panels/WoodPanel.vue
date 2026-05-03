<template>
  <div
    style="height: 100%; width: 100%; position: relative; overflow: hidden;"
  >
    <!-- Fundo de madeira -->
    <v-img
      src="/svg/wooden2.svg"
      alt="Wood background"
      class="wood-background"
    />

    <!-- Papel antigo -->
    <v-img
      src="/svg/old-paper.svg"
      alt="Old Paper"
      width="45%"
      class="position-relative"
      style="z-index: 1; top: 4%; left: 13%"
    />

    <!-- Título -->
    <div
      style="position: relative; left: 24%; font-family: 'Irish Grover', cursive; font-size: 200%; z-index: 2;"
      :style="{ top: titleOffset }"
    >
      <strong>{{ title }}</strong>
    </div>

    <!-- Slot de conteúdo -->
    <div
      :style="{
        position: 'relative',
        zIndex: 2,
        ...contentStyle
      }"
    >
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: "WoodPanel",
  props: {
    title: String,
    titleOffset: {
      type: String,
      default: "-10%",
    },
    contentStyle: {
      type: Object,
      default: () => ({}),
    },
  },
};
</script>

<style scoped>
.wood-background {
  position: absolute;
  top: 0;
  left: 0;
  height: 150vw;
  width: 150vh;
  transform: rotate(90deg) translateY(-100%);
  transform-origin: top left;
  object-fit: cover;
  z-index: 0;
}

@media (max-width: 767px) {
  .wood-background {
    height: 200vw;
    width: 200vw;
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .wood-background {
    height: 200vh;
    width: 300vw;
  }
}
</style>
