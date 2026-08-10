# ADR-007: Gestão de Estado Global no Frontend (Pinia + Composables por Domínio)

## Contexto

No **SecondBrain**, o frontend em Nuxt 3 lida com dois tipos de estados:

1. **Estado de Domínio de Negócio**: Tarefas, Projetos, WBS, Métricas PERT/EVM, Configurações e resumos agregados.
2. **Estado Diegético de UI & Navegação**: Sala ativa na guilda (`hall`, `tasks`, `projects`, `calendar`), estado dos modais do Grimório, configurações de som (mute/volume), nível/XP do aventureiro e controle de transições de câmera.

Sem uma arquitetura clara de gestão de estado, corre-se o risco de acoplamento excessivo entre regras de UI e chamadas de API REST backend.

## Decisão

Adotar a combinação de **Pinia Stores para Estado Reativo de Domínio** e **Vue 3 Composables (`composables/`) para Regras de Tela e Efeitos**:

1. **Pinia Stores (`stores/`)**:
   - `useTaskStore`: CRUD de tarefas, agrupamento por status, filtros por data e atualização reativa.
   - `useProjectStore`: Projetos ativos, metadados visuais de capas/grimórios e sincronização de WBS.
   - `useUiGuildStore`: Estado diegético da guilda, sala ativa, abas ativas do mobile, estado de modais e preferências de som.

2. **Composables Funcionais (`composables/`)**:
   - `composables/api/`: Abstração de chamadas HTTP Axios/Fetch isoladas do componente Vue.
   - `composables/ui/`: `useGuildAudio.ts`, `useResponsive.ts`, `useZoomAnimation.ts`, `useTaskPosition.ts`.
   - `composables/features/`: Regras de tela específicas por módulo (ex: drag & drop do Kanban, conversão de WBS).

## Drivers (por que essa escolha atende aos requisitos)

- **Type-Safety Total**: Suporte nativo do TypeScript a getters e actions no Pinia sem necessidade de mutations em string (como no Vuex legado).
- **Desacoplamento de UI**: Componentes de visualização (ex: `GuildLibraryPortal.vue` ou `KanbanBoard.vue`) apenas consomem dados reativos do store, delegando ações assíncronas ao Pinia.
- **SSR-Friendly**: Pinia integra-se perfeitamente ao Nuxt 3 com hidratação correta entre servidor (Nitro) e cliente.

## Detalhes de Aplicação no SecondBrain

### Store Diegético (`stores/uiGuild.ts`)

```typescript
export const useUiGuildStore = defineStore("uiGuild", () => {
  const activeRoom = ref<"hall" | "tasks" | "projects" | "calendar">("hall");
  const isMuted = ref(false);
  const isReceptionOpen = ref(false);

  function setRoom(room: "hall" | "tasks" | "projects" | "calendar") {
    activeRoom.value = room;
  }

  function toggleMute() {
    isMuted.value = !isMuted.value;
  }

  return { activeRoom, isMuted, isReceptionOpen, setRoom, toggleMute };
});
```

## Onde no código

- **Stores Globais**:
  - `Frontend/stores/task.ts`
  - `Frontend/stores/project.ts`
  - `Frontend/stores/uiGuild.ts`
- **Composables de UI**:
  - [Frontend/composables/ui/useGuildAudio.ts](../../Frontend/composables/ui/useGuildAudio.ts)
  - [Frontend/composables/ui/useResponsive.ts](../../Frontend/composables/ui/useResponsive.ts)
  - [Frontend/composables/ui/useZoomAnimation.ts](../../Frontend/composables/ui/useZoomAnimation.ts)

## Consequências

### Positivas

- Código limpo e de fácil manutenção no frontend.
- Facilidade em persistir preferências no `localStorage` (ex: mute de áudio) mantendo a reatividade da interface.
- Testabilidade dos stores isolados da camada de renderização Vue.

### Negativas / Trade-offs

- Exige disciplina para não espalhar estados locais duplicados dentro dos componentes Vue.

## Validação (Critérios de Aceite)

- Alterações no estado de tarefas refletem-se instantaneamente na interface do Kanban e nas métricas do balcão sem recarregar a página.

## ADRs Relacionadas

- ADR-002: [002-module-separation.md](002-module-separation.md)
- ADR-006: [006-diegetic-ui-architecture.md](006-diegetic-ui-architecture.md)
