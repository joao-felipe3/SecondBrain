<template>
  <div>
    <ul class="project-list">
      <li
        v-for="project in projects"
        :key="project.code"
        class="project-item"
      >
        <div class="project-left">
          <span
            class="project-dot"
            :style="{ backgroundColor: project.color }"
          ></span>
          <span class="project-name">{{ project.name }}</span>
        </div>
        <span class="project-hours">
          {{ project.totalHoursWorked }}h
        </span>
      </li>
    </ul>
    <button class="create-project-btn" @click="onCreateProject">
      <span class="icon">+</span>
      Create a project
    </button>
  </div>
</template>

<script>
export default {
  name: "ProjectList",
  props: {
    projects: {
      type: Array,
      required: true,
    },
  },
  methods: {
    onCreateProject() {
      console.log("Create project clicked");
      // Lógica para criar um novo projeto
    },
  },
};
</script>

<style scoped>
.project-list {
  list-style: none;
  padding: 0 1rem;
  margin: 0;
  width: 100%;
}

.project-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  font-size: 0.9rem;
  font-weight: 400;
  margin: 0.6rem 0;
  color: #000;
}

.project-left {
  display: flex;
  align-items: center;
  flex: 1;
}

.project-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  margin-right: 0.5rem;
  display: inline-block;
}

.project-name {
  text-align: left;
}

.project-hours {
  text-align: right;
  min-width: 3rem;
  color: #667;
}

.create-project-btn {
  display: flex;
  align-items: center;
  justify-content: center; /* Corrige a centralização horizontal */
  margin-top: 1rem;
  background: none;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  width: 100%; /* Garante que o botão ocupe a largura total do contêiner */
  background: var(--gradient-primary);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.create-project-btn:hover {
  text-decoration: underline;
}

.icon {
  font-size: 1.2rem;
  font-weight: bold;
  margin-right: 0.5rem;
  color: #007bff; /* Cor azul padrão */
}
</style>
