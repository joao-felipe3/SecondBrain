<template>
  <TasksMural />
</template>

<script setup lang="ts">
import TasksMural from '~/components/features/tasks/page/TasksMural.vue';

// o Mural de Contratos é uma cena em tela cheia (como o saguão): sem o layout padrão com menu lateral
definePageMeta({
  layout: false,
});
</script>
