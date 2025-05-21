<template>
  <div
    style="height: 100%; width: 100%; position: relative; overflow: hidden;"
  >
    <!-- Fundo de madeira -->
    <v-img
      src="/svg/wooden2.svg"
      alt="Wood background"
      style="
        position: absolute;
        top: 0;
        left: 0;
        height: 100vw;
        width: 100%;
        transform: rotate(90deg) translateY(-100%);
        transform-origin: top left;
        object-fit: fill;
        z-index: 0;
      "
    />

    <!-- Papel antigo -->
    <v-img
      src="/svg/old-paper.svg"
      alt="Old Paper"
      width="55%"
      class="position-relative"
      style="z-index: 1; top: 4%; left: 25%"
    />

    <!-- Título -->
    <div
      style="position: relative; left: 33%; font-family: 'Irish Grover', cursive; font-size: 200%; z-index: 2;"
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
