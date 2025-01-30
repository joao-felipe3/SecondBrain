<template>
  <div class="layout">
    <OrganismsSideBar />

    <main class="main-content">
      <NuxtPage />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  width: 100%;
  background-color: #fefefe
}

.sidebar {
  width: 13.75%;
  color: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo img {
  width: 100%;
  margin-bottom: 0rem;
  margin-top: 1rem;
}

.project-name {
  font-size: 1.8rem;
  font-weight: bold;
  margin-bottom: 2rem;
  background: var(--gradient-primary);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: center;
  line-height: 1.1;
}

.menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
}

.menu ul li {
  margin: 0.5rem 0;
}

.menu ul li a {
  color: #fff;
  text-decoration: none;
  padding: 0.5rem;
  display: block;
  text-align: center;
  border-radius: 0.25rem;
  transition: background-color 0.3s;
}

.menu ul li a:hover {
  background-color: #2d3748;
  /* Cor de hover */
}
</style>