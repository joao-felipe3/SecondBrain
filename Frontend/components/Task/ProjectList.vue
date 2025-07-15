<template>
  <WoodPanel title="Projects" :titleOffset="'-9.5%'" :contentStyle="{ left: '0%', top: '-19%', padding: '2rem' }">
    <ul style="list-style: none; padding: 0; color: white; font-family: 'Irish Grover', cursive;">
      <li
        v-for="project in projects"
        :key="project.code"
        style="display: flex; align-items: center; margin-bottom: 0.5rem;"
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
    <div style="position: relative; width: 180px; left: 18%;">
      <v-img src="/svg/button-2.svg" alt="Button" width="180" height="54" style="object-fit: fill" />
      <div
        style="
          position: absolute;
          top: 46%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 14px;
          color: #eaeaea;
          font-weight: 500;
          pointer-events: none;
          text-align: center;
          text-shadow: 1px 1px 1px rgba(0, 0, 0, 1);
          font-family: 'Irish Grover', cursive;
          white-space: nowrap;
        "
      >
        + Create a Project
      </div>
    </div>
  </WoodPanel>
</template>

<script>
import WoodPanel from "../WoodPanel.vue";

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
