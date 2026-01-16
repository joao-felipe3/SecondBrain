<template>
  <div :style="{ flex: 1, position: 'relative', ...$attrs.style }">
    <!-- Pendulum só aqui -->
    <div class="pendulum-effect">
      <v-img
        src="svg/sign3.svg"
        alt="Sign Image"
        width="100%"
        height="auto"
        contain
      />
      <v-img
        src="svg/old-paper.svg"
        alt="Old Paper"
        width="40%"
        class="position-absolute"
        :style="{ top: paperTop, left: paperLeft }"
        contain
      />
      <div
        class="position-absolute text-center"
        :style="{
          top: paperTop,
          left: paperLeft,
          width: '40%',
          color: 'black',
          fontWeight: 500,
          fontSize: '135%',
          fontFamily: 'Irish Grover, cursive'
        }"
      >
        <span>{{ title }}</span>
      </div>
      <div
        class="position-absolute text-center"
        :style="{
          top: countTop,
          left: countLeft,
          width: '50%',
          color: '#eee',
          fontWeight: 'bold',
          fontSize: '350%',
          fontFamily: 'Irish Grover, cursive'
        }"
      >
        <span>{{ count }}</span>
      </div>
      <div
        class="position-absolute text-center"
        :style="{
          top: countLabelTop,
          left: countLeft,
          width: '50%',
          color: '#eee',
          fontWeight: 400,
          fontSize: '100%',
          fontFamily: 'Irish Grover, cursive'
        }"
      >
        <span>{{ countLabel }}</span>
      </div>
      <div
        class="position-absolute text-center"
        :style="{
          top: timeTop,
          left: timeLeft,
          width: '50%',
          color: '#eee',
          fontWeight: 'bold',
          fontSize: '250%',
          fontFamily: 'Irish Grover, cursive'
        }"
      >
        <span>{{ time }}</span>
      </div>
      <div
        class="position-absolute text-center"
        :style="{
          top: timeLabelTop,
          left: timeLeft,
          width: '50%',
          color: '#eee',
          fontWeight: 400,
          fontSize: '100%',
          fontFamily: 'Irish Grover, cursive'
        }"
      >
        <span>{{ timeLabel }}</span>
      </div>
    </div>
  </div>
</template>


<script setup>
defineProps([
  'title', 'count', 'countLabel', 'time', 'timeLabel',
  'paperTop', 'paperLeft',
  'countTop', 'countLeft', 'countLabelTop',
  'timeTop', 'timeLeft', 'timeLabelTop'
])
</script>


<style scoped>
@keyframes pendulum {
  0% {
    transform: rotate(-2.5deg);
  }
  50% {
    transform: rotate(2.5deg);
  }
  100% {
    transform: rotate(-2.5deg);
  }
}

.pendulum-effect {
  animation: pendulum 5s ease-in-out infinite;
  transform-origin: top center;
}

.pendulum-effect:hover {
  animation-play-state: paused;
}

</style>