<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Curto Prazo</h4>
        <template v-if="editing">
          <textarea v-model="local.shortTermGoal" class="textarea" rows="5" placeholder="Objetivo curto prazo" @input="emitField('shortTermGoal', local.shortTermGoal)" />
        </template>
        <p v-else class="goal-content">{{ project.shortTermGoal }}</p>
        <div class="timeline-info">
          <h5>📅 Cronograma</h5>
          <p><strong>Início:</strong>
            <span v-if="!editing">{{ formatDate(project.startDate) }}</span>
            <input v-else type="date" v-model="local.startDate" class="input" @input="emitField('startDate', local.startDate)" />
          </p>
          <p><strong>Prazo:</strong>
            <span v-if="!editing">{{ formatDate(project.deadline) }}</span>
            <input v-else type="date" v-model="local.deadline" class="input" @input="emitField('deadline', local.deadline)" />
          </p>
        </div>
      </div>
    </div>
    <div class="page right-page">
      <div v-if="project">
        <h5>💡 Dicas para o Sucesso</h5>
        <ul class="tips-list">
          <li>Divida as tarefas em pequenas etapas</li>
          <li>Estabeleça marcos intermediários</li>
          <li>Monitore o progresso regularmente</li>
          <li>Ajuste o cronograma conforme necessário</li>
        </ul>
        <div class="motivation-box">
          <h6>🌟 Motivação</h6>
            <p>"O sucesso é a soma de pequenos esforços repetidos dia após dia."</p>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'

const { formatDate } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
watch(() => props.project, (v) => { if (v) Object.assign(local, v) }, { immediate: true })
watch(() => props.editing, (is) => { if (is && props.project) Object.assign(local, props.project) })

function emitField(field: string, value: any) { emit('update-field', field, value) }
</script>

<style scoped>
.textarea, .input { width:100%; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:.4rem .5rem; border-radius:4px; font:inherit; }
.editing .textarea, .editing .input { background:#fff; color:#222; border:1px solid #c9b28a; box-shadow:0 0 0 2px rgba(140,90,40,0.12); }
.editing .textarea:focus, .editing .input:focus { outline:2px solid #b7791f; outline-offset:2px; }
</style>
