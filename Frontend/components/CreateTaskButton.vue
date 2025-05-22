<template>
  <div class="position-absolute" style="width: 200px; top: 85%; left: 38%; font-family: 'Irish Grover', cursive; z-index: 5;">
    <v-img src="svg/button-2.svg" alt="Create Task" width="200" />
    <div class="label">Create Task</div>
  </div>
</template>

<style scoped>
.label {
  position: absolute;
  top: 44%;
  left: 52%;
  transform: translate(-50%, -50%);
  font-size: 27px;
  color: #eaeaea;
  font-weight: 500;
  pointer-events: none;
  text-align: center;
  width: 100%;
  text-shadow: -2px 3px 2px rgba(0, 0, 0, 1);
}
</style>
