<template>
  <div 
    v-if="isOpen" 
    class="book-modal-overlay"
    @click="closeModal"
  >
    <div class="container" @click.stop>
      <!-- Botão de fechar -->
      <button 
        class="close-button"
        @click="closeModal"
        aria-label="Fechar modal"
      >
        <X :size="32" />
      </button>
      
      <div class="sprite-wrapper">
        <div class="book">
          <!-- Carousel container -->
          <div class="carousel" style="--slides: 4;">
            <!-- Bg sprite -->
            <div class="sprite"></div>
            
            <!-- Página 1: Informações gerais -->
            <div class="carousel-item">
              <div class="page-container">
                <div class="page left-page">
                  <div v-if="project">
                    <h3 class="page-title">{{ project.name }}</h3>
                    <p class="project-description">{{ project.description }}</p>
                    
                    <div class="stats-grid">
                      <div class="stat-row">
                        <Calendar :size="16" />
                        <span>{{ formatDeadline(project.deadline) }}</span>
                      </div>
                      <div class="stat-row">
                        <Coins :size="16" />
                        <span>{{ project.reward }} pontos</span>
                      </div>
                      <div class="stat-row">
                        <Award :size="16" />
                        <span>{{ project.experience }} EXP</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="page right-page">
                  <div v-if="project">
                    <h4>📊 Progresso do Projeto</h4>
                    <div class="progress-info">
                      <p><strong>Horas Trabalhadas:</strong> {{ project.totalHoursWorked }}h</p>
                      <p><strong>Horas Planejadas:</strong> {{ project.plannedHours }}h</p>
                      <p><strong>Progresso:</strong> {{ (project.progressPercentage || 0).toFixed(1) }}%</p>
                    </div>
                    
                    <div class="progress-bar-container">
                      <div 
                        class="progress-bar" 
                        :style="{ 
                          width: `${project.progressPercentage || 0}%`,
                          backgroundColor: project.color 
                        }"
                      ></div>
                    </div>
                    
                    <p><strong>Status:</strong> {{ project.status }}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Página 2: Objetivo de Curto Prazo -->
            <div class="carousel-item">
              <div class="page-container">
                <div class="page left-page">
                  <div v-if="project">
                    <h4>🎯 Objetivo de Curto Prazo</h4>
                    <p class="goal-content">{{ project.shortTermGoal }}</p>
                    
                    <div class="timeline-info">
                      <h5>📅 Cronograma</h5>
                      <p><strong>Início:</strong> {{ formatDate(project.startDate) }}</p>
                      <p><strong>Prazo:</strong> {{ formatDate(project.deadline) }}</p>
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
            </div>
            
            <!-- Página 3: Objetivo de Médio Prazo -->
            <div class="carousel-item">
              <div class="page-container">
                <div class="page left-page">
                  <div v-if="project">
                    <h4>🎯 Objetivo de Médio Prazo</h4>
                    <p class="goal-content">{{ project.midTermGoal }}</p>
                    
                    <div class="strategy-section">
                      <h5>📋 Estratégias</h5>
                      <ul>
                        <li>Planejamento detalhado</li>
                        <li>Alocação de recursos</li>
                        <li>Identificação de riscos</li>
                        <li>Planos de contingência</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div class="page right-page">
                  <div v-if="project">
                    <h5>📈 Métricas de Sucesso</h5>
                    <div class="metrics-info">
                      <p><strong>Meta de Horas:</strong> {{ Math.round((project.plannedHours || 0) * 0.6) }}h</p>
                      <p><strong>Experiência Esperada:</strong> {{ Math.round((project.experience || 0) * 0.6) }} EXP</p>
                      <p><strong>Recompensa Parcial:</strong> {{ Math.round((project.reward || 0) * 0.6) }} pts</p>
                    </div>
                    
                    <div class="checkpoint-box">
                      <h6>🏁 Checkpoint</h6>
                      <p>Revise e ajuste os objetivos conforme o progresso.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Página 4: Objetivo de Longo Prazo -->
            <div class="carousel-item">
              <div class="page-container">
                <div class="page left-page">
                  <div v-if="project">
                    <h4>🎯 Objetivo de Longo Prazo</h4>
                    <p class="goal-content">{{ project.longTermGoal }}</p>
                    
                    <div class="vision-section">
                      <h5>🔮 Visão do Futuro</h5>
                      <p>Imagine o impacto que este projeto terá em sua vida e carreira quando concluído.</p>
                    </div>
                  </div>
                </div>
                <div class="page right-page">
                  <div v-if="project">
                    <h5>🏆 Recompensas Finais</h5>
                    <div class="final-rewards">
                      <div class="reward-item">
                        <Coins :size="20" />
                        <span>{{ project.reward }} pontos totais</span>
                      </div>
                      <div class="reward-item">
                        <Award :size="20" />
                        <span>{{ project.experience }} EXP total</span>
                      </div>
                    </div>
                    
                    <div class="celebration-box">
                      <h6>🎉 Celebração</h6>
                      <p>Não esqueça de celebrar suas conquistas!</p>
                    </div>
                    
                    <div class="next-steps">
                      <h6>➡️ Próximos Passos</h6>
                      <p>Use a experiência adquirida para projetos ainda mais ambiciosos.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { X, Calendar, Coins, Award } from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  project: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const closeModal = () => {
  emit('close')
}

// Função para formatar deadline (mesmo do ProjectPanel)
function formatDeadline(date) {
  if (!date) return 'Sem deadline'
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  if (diff === 0) return "Hoje";
  if (diff < 0) return "ATRASADO!";
  return d.toLocaleDateString("pt-BR", { 
    weekday: "short", 
    day: "2-digit", 
    month: "short" 
  });
}

// Função para formatar data completa
function formatDate(date) {
  if (!date) return 'Não definido'
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long", 
    year: "numeric"
  });
}
</script>

<style>
/*
  Enhanced sprite-based flip book carousel adapted from reference implementation.
  Uses experimental CSS features: scroll-timeline, animation-timeline, ::scroll-button, ::scroll-marker.
  Best in Chrome 134+ (flags may be required). Provides fallback to basic sprite animation when unsupported.
*/

/* Custom @property registrations for animatable CSS variables */
@property --sprite-fs {
  syntax: "<integer>";
  initial-value: 0;
  inherits: true;
}
@property --_progress {
  syntax: "<percentage>";
  initial-value: 0%;
  inherits: false;
}
/* Importação da fonte pixel */
@import url('https://fonts.googleapis.com/css2?family=Irish+Grover&display=swap');

.book-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.3s ease-in-out;
  overflow: hidden;
}

.container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #333;
  font-family: 'Irish Grover', cursive;
  /* Sprite + timeline configuration */
  --sprite-image: url('https://assets.codepen.io/36869/book.webp');
  --sprite-c: 5;           /* columns */
  --sprite-h: 3000;        /* original sprite sheet height */
  --sprite-w: 9600;        /* original sprite sheet width */
  --sprite-f: 7;           /* frames per flip */
  --sprite-fr: 12;         /* frame rate */
  --sprite-as: calc(var(--sprite-f) / var(--sprite-fr) * 1s);
  --sprite-r: round(up, calc(var(--sprite-f) / var(--sprite-c)), 1);
  --sprite-sh: calc(var(--sprite-h) / var(--sprite-r));   /* frame height (raw) */
  --sprite-th: calc(var(--sprite-sh) / 2);                /* target display height */
  --sprite-ar: calc(var(--sprite-th) / var(--sprite-sh)); /* aspect ratio scale factor */
  --sprite-uh: calc(var(--sprite-h) * var(--sprite-ar));
  --sprite-uw: calc(var(--sprite-w) * var(--sprite-ar));
  --sprite-tw: calc(var(--sprite-uw) / var(--sprite-c));  /* frame width */
}

.close-button {
  position: absolute;
  top: 2rem;
  right: 2rem;
  background: rgba(139, 69, 19, 0.9);
  border: 3px solid #8B4513;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #F5DEB3;
  z-index: 10001;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.close-button:hover {
  background: rgba(160, 82, 45, 0.9);
  border-color: #A0522D;
  transform: scale(1.1);
}

.sprite-wrapper {
  position: relative;
  width: 90%;
  max-width: 1000px;
  margin: 0 auto;
}

.book {
  position: relative;
  display: grid;
  grid-template-areas: "scroll scroll scroll" "left markers right";
  gap: 1rem;
}

.sprite {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(1px * var(--sprite-th));
  width: calc(1px * var(--sprite-tw));
  margin: calc(-1px * calc((var(--sprite-th) - (var(--sprite-th) * 0.6107)) / 2)) calc(-1px * calc((var(--sprite-tw) - (var(--sprite-tw) * 0.7042)) / 2));
  background-image: var(--sprite-image);
  transform-origin: center center;
  background-repeat: no-repeat;
  background-size: calc(1px * var(--sprite-uw)) calc(1px * var(--sprite-uh));
  z-index: -1;
  /* dynamic frame calc */
  --sprite-fe: calc(var(--sprite-f) * (var(--slides) - 1));
  --sprite-fs-n: mod(var(--sprite-fs), var(--sprite-f));
  --row: calc(round(down, calc(calc(var(--sprite-tw) * var(--sprite-fs-n)) / var(--sprite-uw)), 1) * var(--sprite-th));
  --col: mod(calc(var(--sprite-tw) * var(--sprite-fs-n)), var(--sprite-uw));
  background-position: calc(-1px * var(--col)) calc(-1px * var(--row));
  animation: frame var(--sprite-as) linear 0s normal none running;
  animation-timeline: --carousel-timeline;
}

.carousel {
  counter-increment: curpage;
  grid-area: scroll;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  display: grid;
  margin: 0 auto;
  width: calc(1px * (var(--sprite-tw) * 0.7042));
  height: calc(1px * (var(--sprite-th) * 0.6107));
  grid: 1fr / auto-flow 100%;
  scroll-timeline: --carousel-timeline x;
  scroll-behavior: smooth;
  scrollbar-width: none;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  scroll-marker-group: after;
}

/* Scroll buttons (experimental) */
.carousel::scroll-button(*) {
  inline-size: 48px;
  aspect-ratio: 1;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.carousel::scroll-button(*):disabled { opacity: .4; filter: grayscale(1); }
.carousel::scroll-button(*):not(:disabled):is(:hover, :active) { filter: drop-shadow(2px 4px 6px rgba(0,0,0,.6)); }
.carousel::scroll-button(*):not(:disabled):active { scale: 90%; }
.carousel::scroll-button(left) { content: '◀'; }
.carousel::scroll-button(right) { content: '▶'; justify-self: flex-end; }

/* Progress marker bar */
.carousel::scroll-marker-group {
  content: "";
  width: 100%;
  height: 6px;
  padding: 2px 0;
  display: grid;
  position: absolute;
  grid-area: markers;
  grid-auto-flow: column;
  place-self: center;
  overflow: hidden;
  border: 1px solid #000;
  background: linear-gradient(90deg, #f1e2b2 0%) no-repeat left center;
  --_progress: calc(calc(100 / var(--slides)) * 1%);
  background-size: var(--_progress, 25%) 100%;
  animation: progress linear both;
  animation-timeline: --carousel-timeline;
}

.carousel-item::scroll-marker {
  content: '';
  position: relative;
  left: -1px;
  width: 100%;
  height: 100%;
  display: block;
  box-shadow: 2px 0 0 #000;
}
.carousel-item:last-of-type::scroll-marker { box-shadow: none; }

.carousel::-webkit-scrollbar {
  display: none;
}

.carousel-item {
  scroll-snap-stop: always;
  scroll-snap-align: start;
  position: relative;
  box-sizing: border-box;
  color: #2c1810;
  background: linear-gradient(145deg, #f5f0e8 0%, #f0e6d6 100%);
  animation: count-before linear forwards;
  animation-range: exit; /* when leaving view */
  animation-timeline: view(x);
  counter-increment: page;
}

.page-container {
  display: flex;
  gap: 2px;
  height: 100%;
  position: relative;
  animation: stay-centered linear both;
  animation-timeline: view(x);
  timeline-scope: --parallax-item;
}

.page-container::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, #d4af8c, #c49a6b, #d4af8c);
  transform: translateX(-50%);
  z-index: 1;
}

.page {
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  display: grid;
  grid-template-rows: 1fr auto;
  padding: 20px;
  position: relative;
}

.left-page, .right-page {
  background: linear-gradient(145deg, #f8f3eb 0%, #f3e8d8 100%);
  border-radius: 4px;
  display: grid;
  grid-template-rows: 1fr auto;
  position: relative;
}

.left-page:after, .right-page:after {
  position: absolute;
  bottom: 10px;
  font-size: 0.65rem;
  color: hsl(35 60% 30%);
}
.left-page:after { right: 12px; content: counter(curpage); }
.right-page { counter-increment: curpage; }
.right-page:after { left: 12px; content: counter(curpage); }

.left-page {
  border-right: 1px solid rgba(212, 175, 140, 0.3);
}

.right-page {
  border-left: 1px solid rgba(212, 175, 140, 0.3);
}

.page > div {
  text-align: justify;
  hyphens: auto;
  line-height: 1.6;
  display: block;
  word-wrap: break-word;
}

.page-title {
  font-family: 'Irish Grover', cursive;
  font-size: 1.8rem;
  margin-bottom: 1rem;
  color: #8B4513;
  text-align: center;
  border-bottom: 2px solid #D2B48C;
  padding-bottom: 0.5rem;
}

.project-description {
  font-size: 1rem;
  margin-bottom: 1rem;
  line-height: 1.5;
  font-style: italic;
}

.stats-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem;
  background: rgba(210, 180, 140, 0.2);
  border-radius: 4px;
}

.progress-bar-container {
  width: 100%;
  height: 12px;
  background: rgba(139, 69, 19, 0.2);
  border-radius: 6px;
  overflow: hidden;
  margin: 0.5rem 0;
}

.progress-bar {
  height: 100%;
  transition: width 0.3s ease;
  border-radius: 6px;
}

.progress-info p {
  margin: 0.3rem 0;
  font-size: 0.95rem;
}

.goal-content {
  font-size: 1.1rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: rgba(240, 230, 140, 0.1);
  border-left: 4px solid #DAA520;
  border-radius: 4px;
}

.timeline-info, .strategy-section, .vision-section {
  margin: 1rem 0;
}

.timeline-info h5, .strategy-section h5, .vision-section h5,
.metrics-info h5, .tips-list + h6, .motivation-box h6,
.checkpoint-box h6, .celebration-box h6, .next-steps h6 {
  color: #8B4513;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
}

.tips-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
}

.tips-list li {
  padding: 0.3rem 0;
  position: relative;
  padding-left: 1.2rem;
}

.tips-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #228B22;
  font-weight: bold;
}

.motivation-box, .checkpoint-box, .celebration-box, .next-steps {
  background: rgba(173, 216, 230, 0.2);
  padding: 0.8rem;
  border-radius: 6px;
  margin: 0.8rem 0;
  border-left: 3px solid #4682B4;
}

.metrics-info {
  margin: 1rem 0;
}

.metrics-info p {
  margin: 0.4rem 0;
}

.final-rewards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
}

.reward-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 215, 0, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

/* Animações */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes frame {
  to {
    --sprite-fs: var(--sprite-fe);
  }
}

@keyframes stay-centered {
  entry 0% { opacity: 0; translate: -100%; }
  entry 75% { opacity: 0; translate: -25%; }
  entry 100% { opacity: 1; translate: 0%; }
  exit 0% { opacity: 1; translate: 0%; }
  exit 50% { opacity: 0; translate: 50%; }
  exit 100% { opacity: 0; translate: 100%; }
}

@keyframes count-before {
  1%, 100% { counter-increment: page curpage; }
}

@keyframes progress { 100% { --_progress: 100%; } }

/* Responsividade */
@media (max-width: 768px) {
  .container {
    --sprite-th: calc(var(--sprite-sh) / 2.5);
    padding: 1rem;
  }
  
  .page-title {
    font-size: 1.4rem;
  }
  
  .page {
    padding: 15px;
    font-size: 12px;
  }
  
  .close-button {
    width: 50px;
    height: 50px;
    top: 1rem;
    right: 1rem;
  }
}

@media (max-width: 560px) {
  .container {
    --sprite-th: calc(var(--sprite-sh) / 4);
  }
  
  .page-title {
    font-size: 1.2rem;
  }
  
  .page {
    padding: 12px;
    font-size: 10px;
  }
  
  .page > div {
    font-size: 0.8rem;
  }
}

/* Suporte para motion reduzido */
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }

/* Fallback for browsers without scroll-timeline support */
@supports not (scroll-timeline: --dummy x) {
  .sprite { animation-timeline: auto; }
  .carousel::scroll-marker-group, .carousel::scroll-button(left), .carousel::scroll-button(right) { display: none; }
}
</style>