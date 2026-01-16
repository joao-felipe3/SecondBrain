# Estrutura de Componentes

Esta pasta contém todos os componentes Vue do projeto, organizados de forma escalável e semântica.

## 📁 Estrutura

```
components/
├── shared/             # Componentes reutilizáveis compartilhados
│   ├── dialogs/       # Diálogos e modais genéricos
│   │   └── DeleteProjectDialog.vue
│   └── fields/        # Campos de formulário reutilizáveis
│       ├── DatePickerField.vue
│       ├── DescriptionField.vue
│       ├── EffortSelect.vue
│       ├── Select.vue
│       ├── Slider.vue
│       └── TextField.vue
│
├── features/          # Componentes organizados por domínio/feature
│   ├── projects/      # TUDO relacionado a projetos
│   │   ├── BookModal.vue        # Modal principal do livro
│   │   ├── BookModal.css        # Estilos do modal
│   │   ├── ProjectPanel.vue     # Painel de listagem
│   │   └── pages/               # Páginas internas do BookModal
│   │       ├── BacklogAndProgress.vue
│   │       ├── GeneralInfoPage.vue
│   │       └── GoalPage.vue
│   │
│   └── tasks/         # TUDO relacionado a tasks
│       ├── board/     # Componentes específicos do board
│       │   ├── BackgroundDecor.vue
│       │   ├── Board.vue
│       │   ├── Card.vue
│       │   ├── Paper.vue
│       │   └── StatsCard.vue
│       ├── Button.vue
│       ├── Calendar.vue
│       ├── Form.vue
│       ├── Main.vue
│       ├── ProjectList.vue
│       ├── Sidebar.vue
│       ├── TaskPreview.vue
│       └── ZoomedContent.vue
│
├── layout/            # Componentes de layout da aplicação
│   └── Sidebar.vue
│
└── ui/                # Componentes UI puros (sem lógica de negócio)
    ├── panels/        # Painéis e containers decorativos
    │   └── WoodPanel.vue
    └── svg/           # Componentes SVG gráficos
        ├── Bar.vue
        ├── Book.vue
        ├── BookShelf.vue
        ├── Button.vue
        ├── Can.vue
        ├── CloseButton.vue
        ├── EffortButton.vue
        ├── IconButton.vue
        ├── OldPaper.vue
        ├── ProgressBar.vue
        ├── ProjectStamp.vue
        └── WoodenTable.vue
```

## 📖 Descrição das Pastas

### `shared/`
Componentes reutilizáveis usados em diferentes features. Devem ser:
- Genéricos e configuráveis via props
- Sem lógica de negócio específica
- Facilmente testáveis isoladamente

#### `shared/dialogs/`
Diálogos e modais:
- **DeleteProjectDialog.vue** - Diálogo de confirmação para exclusão de projeto

#### `shared/fields/`
Campos de formulário:
- **DatePickerField.vue** - Seletor de data com calendário
- **DescriptionField.vue** - Textarea para descrições
- **EffortSelect.vue** - Seletor de estrelas para Pomodoros
- **Select.vue** - Select dropdown genérico
- **Slider.vue** - Slider de níveis (1-4)
- **TextField.vue** - Campo de texto genérico

### `features/`
Componentes organizados por domínio de negócio:

#### `features/projects/`
Componentes relacionados a projetos:
- **BookModal.vue** - Modal principal de visualização/edição de projeto
- **ProjectPanel.vue** - Painel com lista de projetos
- **pages/** - Páginas internas do BookModal (Informações Gerais, Metas, Backlog)

#### `features/tasks/`
Componentes relacionados a tarefas:
- **Main.vue** - Container da página de tasks
- **Form.vue** - Formulário de criação/edição de task
- **Calendar.vue** - Visualização de calendário
- **ProjectList.vue** - Lista de tasks por projeto
- **board/** - Componentes do board de tarefas (drag-drop)

### `layout/`
Componentes de layout da aplicação:
- **Sidebar.vue** - Barra lateral de navegação principal

### `ui/`
Componentes UI puros (apenas apresentação):

#### `ui/panels/`
Painéis e containers:
- **WoodPanel.vue** - Painel com estilo de madeira

#### `ui/svg/`
Componentes SVG para fins decorativos:
- Todos os componentes SVG (Book, BookShelf, Button, etc.)

## 🔗 Padrões de Import

### Imports relativos dentro da pasta components:
```vue
<!-- De features/projects/BookModal.vue -->
import DeleteDialog from '../../shared/dialogs/DeleteProjectDialog.vue'
import WoodPanel from '../../ui/panels/WoodPanel.vue'
```

### Imports com alias de páginas:
```vue
<!-- De pages/projects/index.vue -->
import ProjectPanel from '~/components/features/projects/ProjectPanel.vue'
import DeleteDialog from '~/components/shared/dialogs/DeleteProjectDialog.vue'
```

### Imports de composables com alias:
```vue
<!-- De qualquer lugar -->
import { useApi } from '~/composables/useApi'
```

## 📝 Convenções

1. **Pastas de features** devem conter todos os componentes relacionados àquela funcionalidade
2. **Componentes shared** devem ser genéricos e reutilizáveis entre features
3. **Componentes UI** devem ser puramente apresentacionais (sem chamadas API ou estado complexo)
4. **Componentes de layout** definem a estrutura da aplicação
5. Use **subpastas** quando uma feature tem múltiplos componentes relacionados (ex: `tasks/board/`)

## 🚀 Escalabilidade

Para adicionar novas features:

1. Crie uma nova pasta em `features/` (ex: `features/calendar/`)
2. Organize componentes específicos da feature dentro
3. Extraia partes reutilizáveis para `shared/` se usadas por múltiplas features
4. Mantenha lógica de negócio em composables, não nos componentes UI

Exemplo para uma nova feature de Calendário:
```
features/
└── calendar/
    ├── CalendarView.vue
    ├── EventCard.vue
    └── EventModal.vue
```

## ✅ Benefícios desta Organização

- **Escalabilidade**: Fácil adicionar novas features sem bagunça
- **Manutenibilidade**: Código organizado por domínio, fácil de encontrar
- **Reutilização**: Componentes compartilhados centralizados
- **Clareza**: Cada pasta tem propósito claro e bem definido
- **Colaboração**: Estrutura intuitiva para novos desenvolvedores
