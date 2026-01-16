<template>
  <v-row class="d-flex align-center justify-start pa-0" no-gutters>
    <div class="d-flex w-100 mt-1" style="position: relative; height: auto;">
      <TaskCard
        title="Left to Do"
        count="5"
        countLabel="Pending tasks"
        time="2h 05min"
        timeLabel="Estimated Time"
        paperTop="31%"
        paperLeft="30%"
        countTop="41%"
        countLeft="0%"
        countLabelTop="80%"
        timeTop="50%"
        timeLeft="45%"
        timeLabelTop="80%"
        style="margin-top: 1.5%;"
      />

      <TaskCard
        title="Already Done"
        count="4"
        countLabel="Completed tasks"
        time="1h 40min"
        timeLabel="Estimated Time"
        paperTop="31%"
        paperLeft="30%"
        countTop="41%"
        countLeft="0%"
        countLabelTop="80%"
        timeTop="50%"
        timeLeft="45%"
        timeLabelTop="80%"
        style="margin-left: -30px;"
      />
    </div>
  </v-row>
</template>

<script setup>
defineProps({})
</script>