<template>
  <div 
    key="edit-content" 
    class="pt-10 px-10 card-content" 
    style="max-width: 430px; margin-left: 8%;"
  >
    <SvgCloseButton @close="$emit('close')" />
    <TaskForm
      :task="props.task"
      :projects="props.projects"
      create-or-edit="Edit"
      v-model:is-valid="isFormValid"
    />
    <v-row class="mt-6 ml-n6" dense>
      <v-col cols="6" class="py-0 px-2">
        <SvgButton label="Delete" @click="$emit('delete')" :disabled="false"/>
      </v-col>
      <v-col cols="6" class="py-0 px-2">
        <SvgButton :label="props.createOrEdit" @click="$emit('edit')" :disabled="!isFormValid" />
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
  const props = defineProps({
    task: Object,
    projects: Array,
    createOrEdit: String,
    deadline: String,
    notification: String,
  })

  const isFormValid = ref(false)

  const emit = defineEmits([
    'edit',
    'delete',
    'close',
  ])

</script>