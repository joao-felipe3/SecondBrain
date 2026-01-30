<template>
  <WoodPanel title="Projects" :titleOffset="'-9.5%'" style="overflow: visible; width: 90%;" :contentStyle="{ left: '0%', top: '-19%', padding: '2rem' }">
    <ul style="list-style: none; padding: 0; color: white; font-family: 'Irish Grover', cursive;">
      <li
        v-for="project in projects"
        :key="project.code"
        style="display: flex; align-items: center; margin-bottom: 0.5rem; margin-right: 3rem;"
      >
        <span
          :style="{
            backgroundColor: project.color,
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            display: 'inline-block',
            marginRight: '0.5rem',
          }"
        ></span>
        <span style="flex-grow: 1;">{{ project.name }}</span>
        <span style="font-weight: bold;">{{ project.totalHoursWorked }}h</span>
      </li>
    </ul>
  </WoodPanel>
</template>

<script>
import WoodPanel from "../../../ui/panels/WoodPanel.vue";

export default {
  name: "ProjectList",
  components: {
    WoodPanel,
  },
  props: {
    projects: Array,
  },
};
</script>
