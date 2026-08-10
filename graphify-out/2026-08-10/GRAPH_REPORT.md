# Graph Report - . (2026-08-10)

## Corpus Check

- Large corpus: 697 files · ~7,411,440 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary

- 4381 nodes · 10013 edges · 239 communities (188 shown, 51 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)

- .generateContent()
- prompt-builder.service.ts
- audit.prompts.ts
- AIModule
- buffer.controller.ts
- dependency.prompts.ts
- .constructor()
- dialogs/index.ts
- PertDiagramVisualization.vue
- .recalculateProjectStats()
- microtask-detail.prompts.ts
- GeminiService
- evm/index.ts
- UpdateRecurringRuleDto
- ConversionActions.vue
- evm.dto.ts
- cpm.controller.ts
- feedback.prompts.ts
- projects-core.controller.ts
- cpm.interface.ts
- HabitTimelineTab.vue
- .getTaskSuggestions()
- alerts.controller.ts
- KanbanBoard.vue
- project.entity.ts
- dto/traceability/index.ts
- PertDiagramPage.vue
- features/index.ts
- x-matrix.dto.ts
- .generateChecklistForTask()
- GanttPage.vue
- ai-wiki.controller.ts
- ArrayNotEmpty
- WBSPage.vue
- notification
- Board.vue
- risk.prompts.ts
- Body
- .constructor()
- tasks/layout/Sidebar.vue
- dependencies
- pert.interface.ts
- ai.module.ts
- rtm.prompts.ts
- ProjectsWbsController
- AllocateTasksWithDeadlineOptions
- habits.controller.ts
- pert-estimate.dto.ts
- hierarchy.dto.ts
- AssignMilestonesParamsDto
- EVMDashboard.vue
- ProjectWavesTimeline.vue
- RTMMatrix.vue
- .getPertDiagramData()
- RecurringExceptionDto
- CriticalPathPage.vue
- RTMPage.vue
- autoprefixer
- GroupedPackageTasks
- @commitlint/cli
- projects-visualization.controller.ts
- wave-and-risk.controller.ts
- InjectModel
- BookModal.vue
- handleDeleteNode()
- TaskPreview.vue
- CompletionFeedbackModal.vue
- scripts
- planning.prompts.ts
- .constructor()
- ConversionOptions
- Backend/tsconfig.json
- cytoscape
- GuildDeskBookWidget.vue
- GuildTopBanner.vue
- RecurringRuleDto
- ZoomedContent.vue
- rolling-wave.prompts.ts
- rtm.controller.ts
- CriticalPathAnalysisPanel.vue
- gantt.dto.ts
- XMatrix.vue
- PertTab.vue
- EVMDashboardManualVisibility
- DeterministicProjectInput
- FeedbackTab.vue
- ActivityGraph.vue
- ProjectBufferDashboard.vue
- TaskLineagePanel.vue
- components/layout/Sidebar.vue
- jest
- PERTEstimationCard.vue
- pert/usePertDiagramData.ts
- projects-wbs.controller.ts
- pert-diagram.dto.ts
- projects.module.ts
- projects/index.ts
- WBSTreeVisualization.vue
- GeminiExecutorService
- rolling-wave.interface.ts
- execution/index.ts
- RiskRegister.vue
- BackgroundDecor.vue
- HabitPreview.vue
- ChecklistEmbedded.vue
- TaskForm.vue
- AIPlanWave
- ApplyGuardrailsParams
- wbs.interface.ts
- GuildDiegeticHotspots.vue
- GuildLibraryPortal.vue
- GuildReceptionDesk.vue
- autoGenerateRequirements()
- Paper.vue
- MicroTaskDetailSection.vue
- DatePickerField.vue
- NextStepsPromptParams
- addDays()
- cpm-diagnostics.dto.ts
- AutoMapRequirementsResponseDto
- GuildNpcSpeechBubble.vue
- LeafDetailsPanel.vue
- ProjectsPlanningController
- RiskPage.vue
- DeviationWarningAlert.vue
- .suggestPertEstimates()
- GuildArchPortal.vue
- BacklogAndProgress.vue
- SmartObjectivesPage.vue
- ProjectInfoCard.vue
- RiskRegisterList.vue
- ProjectRow.vue
- ChecklistTab.vue
- export-graph-html.ts
- index-wiki.ts
- ChecklistAiService
- EVMMetricRelevance
- CacheService
- GenerateTasksResponseDto
- SettingsDialog.vue
- @google/generative-ai
- .generatePlan()
- app.controller.ts
- domain/interfaces/index.ts
- ResolutionDialog.vue
- .inferDependencies()
- HabitStatsTab.vue
- Button.vue
- ProgressBar.vue
- devDependencies
- GuildParticlesCanvas.vue
- PERTDisplay.vue
- DeleteProjectDialog.vue
- overrides
- ApiProperty
- tsconfig.build.json
- BacklogSection.vue
- LineageTab.vue
- scripts
- Backend/package.json
- PrivatePertAiService
- ModelSelectionDialog.vue
- SmartDetailCard.vue
- BookShelf.vue
- usePertLayoutFallbacks.ts
- pert/usePertRouteOptimization.ts
- nest-cli.json
- FreshMongoExecuteDto
- GeneralInfoPage.vue
- Select.vue
- TextField.vue
- Frontend/package.json
- usePertRenderFinalizer.ts
- usePertRetryCoordinator.ts
- useApiFetch.ts
- EditarTab.vue
- DescriptionField.vue
- Slider.vue
- usePertCytoscapeBootstrap.ts
- usePertRenderFailureState.ts
- HabitPreview.spec.ts
- server/tsconfig.json
- sprint4-qa-checklist.ts
- Frontend/tsconfig.json
- tippy-js.d.ts
- autocannon
- axios
- eslint-config-prettier
- @eslint/eslintrc
- @eslint/js
- eslint-plugin-prettier
- globals
- jest
- mongodb-memory-server
- @nestjs/cli
- @nestjs/schematics
- @nestjs/testing
- source-map-support
- supertest
- @swc/cli
- @swc/core
- ts-jest
- ts-loader
- ts-node
- tsconfig-paths
- @types/express
- @types/jest
- @types/node
- @types/supertest
- typescript
- typescript-eslint
- cytoscape-dagre
- ZoomedContent.spec.ts
- nuxt.config.ts
- lucide-vue-next
- pinia
- sass
- vue-echarts
- vuetify
- @vue/test-utils
- cytoscape-dagre.d.ts
- cytoscape-popper.d.ts
- pre-push

## God Nodes (most connected - your core abstractions)

1. `TaskDocument` - 162 edges
2. `WBSNodeDto` - 81 edges
3. `TasksService` - 67 edges
4. `GeminiService` - 57 edges
5. `Task` - 50 edges
6. `CreateTaskDto` - 44 edges
7. `useApi()` - 44 edges
8. `MicroTaskDraft` - 43 edges
9. `ProjectDocument` - 42 edges
10. `ConfigService` - 42 edges

## Surprising Connections (you probably didn't know these)

- `useProjectDelete()` --indirect_call--> `confirmDelete()` [INFERRED]
  Frontend/composables/features/useProjectDelete.ts → Frontend/components/features/projects/BookModal.vue
- `onConfirmDelete()` --calls--> `confirmDelete()` [EXTRACTED]
  Frontend/pages/projects/index.vue → Frontend/components/features/projects/BookModal.vue
- `clearCycles()` --calls--> `confirm()` [INFERRED]
  Frontend/components/features/projects/pages/CriticalPathPage.vue → Frontend/components/features/projects/dialogs/conversion/ModelSelectionDialog.vue
- `convertToTasks()` --calls--> `confirm()` [INFERRED]
  Frontend/components/features/projects/pages/WBSPage.vue → Frontend/components/features/projects/dialogs/conversion/ModelSelectionDialog.vue
- `deleteNode()` --calls--> `confirm()` [INFERRED]
  Frontend/components/features/projects/sections/WBSTreeNode.vue → Frontend/components/features/projects/dialogs/conversion/ModelSelectionDialog.vue

## Import Cycles

- 4-file cycle: `Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts`
- 4-file cycle: `Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts`
- 4-file cycle: `Backend/src/projects/services/drafts/draft-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-plan-generation.service.ts`
- 4-file cycle: `Backend/src/projects/services/drafts/draft-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-plan-generation.service.ts`
- 4-file cycle: `Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts`
- 4-file cycle: `Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-generation.service.ts -> Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion.service.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-generation.service.ts -> Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/core/wbs.service.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-single-pass-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion.service.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-plan-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion.service.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-generation.service.ts -> Backend/src/projects/services/drafts/draft-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-generation.service.ts -> Backend/src/projects/services/drafts/draft-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-generation.service.ts -> Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/task-conversion-helper.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-generation.service.ts -> Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/core/wbs.service.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-plan-generation.service.ts`
- 5-file cycle: `Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts -> Backend/src/projects/services/wbs/index.ts -> Backend/src/projects/services/wbs/core/wbs.service.ts -> Backend/src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service.ts -> Backend/src/projects/services/drafts/index.ts -> Backend/src/projects/services/drafts/draft-with-plan-generation.service.ts`

## Communities (239 total, 51 thin omitted)

### Community 0 - ".generateContent()"

Cohesion: 0.07
Nodes (50): DraftsAiService, Injectable, ConcurrencyParams, DraftBatchItem, DraftBatchResult, EnrichOutlinesParamsDto, GenerateLeafDraftsDto, GenerateLeafDraftsWithPlanDto (+42 more)

### Community 1 - "prompt-builder.service.ts"

Cohesion: 0.07
Nodes (39): PromptBuilderService, Injectable, WBSNodeDto, ApplyRebaselineFixParams, ApplySimplifyFixParams, AuditLeafDiscrepancyParams, AuditRecord, AutoFixMonotonyParams (+31 more)

### Community 2 - "audit.prompts.ts"

Cohesion: 0.06
Nodes (22): buildAuditPrompt(), buildWbsDecompositionPrompt(), buildWbsGenerationPrompt(), Injectable, WbsAiService, AuditLeafDiscrepancyAiInput, AuditLeafDiscrepancyAiResult, GenerateWbsInput (+14 more)

### Community 3 - "AIModule"

Cohesion: 0.05
Nodes (41): AIModule, Module, AppModule, Module, MongooseLoggerInterceptor, Injectable, ProjectsModule, Module (+33 more)

### Community 4 - "buffer.controller.ts"

Cohesion: 0.07
Nodes (34): BufferController, ApiOperation, ApiResponse, ApiTags, Body, Controller, Get, Param (+26 more)

### Community 5 - "dependency.prompts.ts"

Cohesion: 0.09
Nodes (33): buildInferInterLeafPrompt(), buildInferWithAiPrompt(), buildRetryPrompt(), InferenceLeafGatesDto, InferenceTaskDto, InferInterLeafWithAiDto, InferredDependencyDto, InferWithAiDto (+25 more)

### Community 6 - ".constructor()"

Cohesion: 0.07
Nodes (13): InjectModel, InsertManyError, InjectModel, TaskDocument, InjectModel, TasksHabitsService, Injectable, InjectModel (+5 more)

### Community 7 - "dialogs/index.ts"

Cohesion: 0.05
Nodes (45): answerEdited, answers, budgetValidation, canProceed, clearError(), conversationId, convertAndClose(), currentAnswer (+37 more)

### Community 8 - "PertDiagramVisualization.vue"

Cohesion: 0.05
Nodes (51): activeImpactNodeId, applyGraph(), applyImpactSimulationForNode(), applyImpactSummaryToGraph(), {
applyLayoutPass,
}, {
applyRenderFailureState,
}, {
bindPertGraphEvents,
}, {
buildElements,
} (+43 more)

### Community 9 - ".recalculateProjectStats()"

Cohesion: 0.09
Nodes (11): CalculateProgressDto, CreateManyTasksOptionsDto, IsBoolean, IsOptional, CreateMicroTaskDto, CreateTaskDto, TasksMetricsService, Injectable (+3 more)

### Community 10 - "microtask-detail.prompts.ts"

Cohesion: 0.08
Nodes (27): buildMicroTasksGeneratorPrompt(), buildMicroTasksOutlineWithPlanPrompt(), buildFixMonotonyPrompt(), WBSLeafProjectContext, BatchMetricInputTask, BatchMetricsOptions, ChunkMinutesParams, PertCalculationResult (+19 more)

### Community 11 - "GeminiService"

Cohesion: 0.12
Nodes (20): GeminiService, Injectable, RequirementMaps, RTMMatrixData, RTMRequirementData, RTMTaskData, RTMValidation, ValidationIssues (+12 more)

### Community 12 - "evm/index.ts"

Cohesion: 0.11
Nodes (12): ProjectStatsService, Injectable, UpdateChecklistDto, ChecklistItemDto, RecurringTaskOccurrenceDto, ChecklistValidationResult, InjectModel, ChecklistService (+4 more)

### Community 13 - "UpdateRecurringRuleDto"

Cohesion: 0.15
Nodes (15): UpdateRecurringRuleDto, TasksController, ApiOperation, ApiResponse, ApiTags, Body, Controller, Delete (+7 more)

### Community 14 - "ConversionActions.vue"

Cohesion: 0.06
Nodes (41): emit, accumulatedHours, applyDedupeOnly(), applyRebaseline(), applySimplifyToBudget(), applySimplifyToTargetHours(), approvedTasks, budgetAlertType (+33 more)

### Community 15 - "evm.dto.ts"

Cohesion: 0.13
Nodes (29): BuildEVMCurvePointsParamsDto, BuildPersonalMetricsParamsDto, EstimateCompletionDateParamsDto, EVMActiveWaveContextDto, EVMCoreMetricsDto, EVMCurve, EVMForecast, EVMMetricVisibility (+21 more)

### Community 16 - "cpm.controller.ts"

Cohesion: 0.09
Nodes (42): AddDependencyDto, ApplySummaryDto, AutoInferDependenciesDto, AutoInferDependenciesResponseDto, BuildCriticalPathSequenceDto, CalculateCriticalPathResponseDto, ClearDependencyCycleDto, ComputeGraphDegreesDto (+34 more)

### Community 17 - "feedback.prompts.ts"

Cohesion: 0.08
Nodes (20): buildFeedbackPrompt(), CompletionFeedbackPayloadDto, CompletionFeedbackResponse, CompletionFeedbackResult, GenerateFeedbackOnCompletionDto, NextStepSuggestion, SaveErrorFeedbackOnCompletionDto, SaveSuccessFeedbackDto (+12 more)

### Community 18 - "projects-core.controller.ts"

Cohesion: 0.10
Nodes (17): ProjectsCoreController, ApiOperation, ApiResponse, ApiTags, Body, Controller, Delete, Get (+9 more)

### Community 19 - "cpm.interface.ts"

Cohesion: 0.08
Nodes (42): AlertDiagnosticsInput, BackwardPassMaps, BackwardPassParams, BuildBackwardPassMapsParams, BuildCriticalPathParams, BuildForwardPassMapsParams, ComputeGraphDegreesParams, CPMAnalyticsResult (+34 more)

### Community 20 - "HabitTimelineTab.vue"

Cohesion: 0.05
Nodes (36): adherenceRate, currentPeriodOffset, currentStreak, getDayStatus(), getDayTooltip(), isDayCompleted(), isDaySkipped(), longestStreak (+28 more)

### Community 21 - ".getTaskSuggestions()"

Cohesion: 0.15
Nodes (19): AiSuggestionsProgressDto, AiSuggestionsResponseDto, AiTaskSuggestionDto, GenerateAiSuggestionsDto, FetchSuggestionsParams, SuggestionState, TasksAiSuggestionsLoopRunner, Injectable (+11 more)

### Community 22 - "alerts.controller.ts"

Cohesion: 0.07
Nodes (20): AlertsController, ApiOperation, ApiResponse, ApiTags, Controller, Get, Param, Patch (+12 more)

### Community 23 - "KanbanBoard.vue"

Cohesion: 0.06
Nodes (34): bump(), columnBodyRefs, columns, completionModalOpen, completionModalTask, draggingFromStatus, draggingTaskId, emit (+26 more)

### Community 24 - "project.entity.ts"

Cohesion: 0.10
Nodes (15): Project, FindByProjectIdOptionsDto, IsArray, IsOptional, IsString, Task, TaskChecklistItem, TaskRecurringRule (+7 more)

### Community 25 - "dto/traceability/index.ts"

Cohesion: 0.10
Nodes (16): MapRequirementToTaskDto, PreparedRequirementDataDto, ProcessSingleRequirementDto, RTMValidationDto, SaveRequirementDto, ApiProperty, ApiPropertyOptional, IsNotEmpty (+8 more)

### Community 26 - "PertDiagramPage.vue"

Cohesion: 0.05
Nodes (38): adaptiveGroupMap, blockedIds, buildGroupMapByDepth(), criticalEdgesOnly, detailGraph, displayBlockedIds, displayEdges, displayFocusIds (+30 more)

### Community 27 - "features/index.ts"

Cohesion: 0.08
Nodes (28): usePertDiagramState(), HandleEmptyGraphParams, PertResolvedLayoutMode, usePertEmptyGraphHandler(), usePertGeometryOptimizer(), BindPertGraphEventsParams, usePertGraphEventBindings(), InitializePertGraphParams (+20 more)

### Community 28 - "x-matrix.dto.ts"

Cohesion: 0.12
Nodes (35): XMatrixAxisItemDto, XMatrixCellDto, XMatrixDiagnosticsDto, XMatrixStrength, ActiveIds, ApplyFractalFilterOptions, BuildTacticalItemsOptions, CalculateCorrelationsOptions (+27 more)

### Community 29 - ".generateChecklistForTask()"

Cohesion: 0.09
Nodes (14): FindSimilarTasksDto, GenerateChecklistDto, GenerateChecklistWithHistoryDto, ApiProperty, IsBoolean, IsNotEmpty, IsNumber, IsOptional (+6 more)

### Community 30 - "GanttPage.vue"

Cohesion: 0.06
Nodes (33): displayCriticalPath, displayDependencies, displayTasks, extractWbsParts(), filteredTasks, groupByWbs, groupedBuckets, groupedTasks (+25 more)

### Community 31 - "ai-wiki.controller.ts"

Cohesion: 0.09
Nodes (24): AiWikiController, ApiOperation, ApiResponse, ApiTags, Body, Controller, Post, GraphEdgeDto (+16 more)

### Community 32 - "ArrayNotEmpty"

Cohesion: 0.07
Nodes (23): ArrayNotEmpty, MicroTaskType, PertSuggestionResponseDto, SuggestPertDto, IsEnum, IsOptional, IsString, IsBoolean (+15 more)

### Community 33 - "WBSPage.vue"

Cohesion: 0.07
Nodes (33): applySuggestion(), buildWorkflowMix(), conversionResult, converting, convertToTasks(), decompositionSuggestion, emit, generateWBS() (+25 more)

### Community 34 - "notification"

Cohesion: 0.07
Nodes (29): notification, useTaskHelpers(), activeIcon, allTasks, api, canSendBrowserNotifications(), { createNewTask }, enableHabitNotifications() (+21 more)

### Community 35 - "Board.vue"

Cohesion: 0.09
Nodes (25): containerRef, emit, { getTaskPositionStyle }, { handleEdit, handleDelete, handleCompleteFall }, handleNavigateTask(), maxVisibleTasks, route, router (+17 more)

### Community 36 - "risk.prompts.ts"

Cohesion: 0.12
Nodes (17): buildRiskAssessmentPrompt(), GeneratedRisk, LLMRiskAssessmentResponse, RiskIntervention, RiskInterventionsResponse, RiskRecommendedAction, RiskSeverity, RiskStatistics (+9 more)

### Community 37 - "Body"

Cohesion: 0.18
Nodes (8): Body, Controller, Delete, Get, Param, Patch, Post, WaveAndRiskController

### Community 39 - "tasks/layout/Sidebar.vue"

Cohesion: 0.07
Nodes (18): alerts, alertsStore, props, unreadCount, userId, clearFilters(), emit, emitChanges() (+10 more)

### Community 40 - "dependencies"

Cohesion: 0.06
Nodes (33): dependencies, class-transformer, class-validator, ioredis, joi, mongoose, @nestjs/common, @nestjs/config (+25 more)

### Community 41 - "pert.interface.ts"

Cohesion: 0.13
Nodes (20): BuildPertTaskNodesParams, MapPertEdgesParams, MapPertNodesParams, CreateDependencyDto, ApiProperty, IsBoolean, IsNotEmpty, IsOptional (+12 more)

### Community 42 - "ai.module.ts"

Cohesion: 0.17
Nodes (12): ChecklistPromptParams, ChecklistWithHistoryPromptParams, CompletionFeedbackPromptParams, PertEstimatePromptParams, TaskSuggestionsPromptParams, buildChecklistGenerationPrompt(), buildChecklistWithHistoryPrompt(), buildCompletionFeedbackPrompt() (+4 more)

### Community 43 - "rtm.prompts.ts"

Cohesion: 0.14
Nodes (18): buildAutoMapBatchPrompt(), buildGenerateRequirementsPrompt(), buildGenerateTasksPrompt(), JourneyKind, RequirementType, RTMJourneyService, Injectable, applyFallbackMapping() (+10 more)

### Community 44 - "ProjectsWbsController"

Cohesion: 0.18
Nodes (11): ProjectsWbsController, ApiOperation, ApiResponse, ApiTags, Body, Controller, Get, Param (+3 more)

### Community 45 - "AllocateTasksWithDeadlineOptions"

Cohesion: 0.10
Nodes (18): AllocateTasksWithDeadlineOptions, BuildWavesOptions, DeterministicPartitionResult, DeterministicWaveResult, NormalizeTasksOptions, PartitionTasksDeterministicDto, TimelineMetrics, TimelineMetricsOptions (+10 more)

### Community 46 - "habits.controller.ts"

Cohesion: 0.12
Nodes (17): HabitsController, ApiOperation, ApiResponse, ApiTags, Controller, Get, Query, GetHabitsDashboardDto (+9 more)

### Community 47 - "pert-estimate.dto.ts"

Cohesion: 0.13
Nodes (13): PertEstimateDto, PertEstimateResponseDto, ApiProperty, IsNumber, IsNumber, UpdatePertDto, PertService, TasksPertService (+5 more)

### Community 48 - "hierarchy.dto.ts"

Cohesion: 0.14
Nodes (14): TaskDescendantQueryDto, TaskLineageQueryDto, ApiProperty, IsNumber, IsOptional, Max, Min, ValueContributionResponseDto (+6 more)

### Community 49 - "AssignMilestonesParamsDto"

Cohesion: 0.15
Nodes (14): AssignMilestonesParamsDto, MicroTaskOutline, DraftProcessingService, Injectable, mapCognitiveModeToContextTag(), mapMicroTaskTypeToCognitiveMode(), normalizeCognitiveMode(), normalizeMicroTaskType() (+6 more)

### Community 50 - "EVMDashboard.vue"

Cohesion: 0.07
Nodes (22): curveRows, deletingId, emptySummary, entries, errorMessage, EVMSummary, forecast, interpretation (+14 more)

### Community 51 - "ProjectWavesTimeline.vue"

Cohesion: 0.08
Nodes (23): activateWave(), activeWaveLabel, completeWave(), currentWaveIndex, generateWaves(), getWaveCompactLabel(), isFutureWave(), isSelectedWaveFuture (+15 more)

### Community 52 - "RTMMatrix.vue"

Cohesion: 0.07
Nodes (22): autoGenerating, autoMapping, currentPage, deletingRequirementId, expandedValidation, getTasksForRequirement(), getUnmappedTasks(), groupedTasksForAutocomplete (+14 more)

### Community 53 - ".getPertDiagramData()"

Cohesion: 0.18
Nodes (12): CPMController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Delete (+4 more)

### Community 54 - "RecurringExceptionDto"

Cohesion: 0.18
Nodes (25): RecurringExceptionDto, calculateFirstMonthlyRecurringDate(), calculateFirstRecurringDate(), calculateMonthlyRecurringDate(), calculateNextRecurringDate(), calculateSteppedRecurringDate(), findFirstAllowedRecurringDate(), getAllowedDays() (+17 more)

### Community 55 - "CriticalPathPage.vue"

Cohesion: 0.08
Nodes (26): alerts, autoInferError, autoInferLoading, autoInferMaxEdgesPerLeaf, autoInferPreview, autoInferPreviewSample, autoInferStrategy, autoInferStrategyItems (+18 more)

### Community 56 - "RTMPage.vue"

Cohesion: 0.12
Nodes (13): openModal(), useProjectDelete(), useProjectModal(), useProjects(), Project, hoveredProjectIndex, isMobile, { isModalOpen, selectedProject, startInEdit, focusedSlide, openModal, closeModal, createNewProject } (+5 more)

### Community 57 - "autoprefixer"

Cohesion: 0.07
Nodes (27): autoprefixer, cross-env, eslint-plugin-vue, devDependencies, autoprefixer, cross-env, eslint, eslint-config-prettier (+19 more)

### Community 58 - "GroupedPackageTasks"

Cohesion: 0.14
Nodes (22): GroupedPackageTasks, RawPackageMetrics, generateAlerts(), calculateCriticalPath(), calculateSlacksAndCriticalTasks(), computeGraphDegrees(), createCPMDiagnostics(), executeCPMPasses() (+14 more)

### Community 59 - "@commitlint/cli"

Cohesion: 0.08
Nodes (26): @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, description, devDependencies, @commitlint/cli, @commitlint/config-conventional (+18 more)

### Community 60 - "projects-visualization.controller.ts"

Cohesion: 0.15
Nodes (14): ProjectsVisualizationController, ApiOperation, ApiResponse, ApiTags, Body, Controller, Get, Param (+6 more)

### Community 61 - "wave-and-risk.controller.ts"

Cohesion: 0.11
Nodes (21): IDepRecord, ITaskRecord, RecordProjectProgressDto, IsDateString, IsNumber, IsOptional, AssessRisksDto, CreateRiskDto (+13 more)

### Community 62 - "InjectModel"

Cohesion: 0.13
Nodes (13): InjectModel, MapSingleTaskItemParams, MapTaskItemsParams, ResolveWindowParams, GenerateXMatrixDataOptions, ProjectDocument, ProjectWaveDocument, InjectModel (+5 more)

### Community 63 - "BookModal.vue"

Cohesion: 0.11
Nodes (23): api, cancelEdit(), { carouselEl, currentIndex, atStart, atEnd, go, updateIndex, attach, detach, reset }, closeModal(), confirmDelete(), { editing, saving, draft, displayProject, isValid, startEdit: startEditInner, cancelEdit: cancelEditInner, updateField, reset: resetEditing }, emit, finishClose() (+15 more)

### Community 64 - "handleDeleteNode()"

Cohesion: 0.09
Nodes (17): handleDeleteNode(), addChild(), deleteNode(), editData, emit, expanded, handleDrop(), isDragging (+9 more)

### Community 65 - "TaskPreview.vue"

Cohesion: 0.08
Nodes (17): checklistCompleted, checklistTotal, descriptionRef, emit, formattedPertDeadline, handleComplete(), isDescriptionTruncated, isTruncated (+9 more)

### Community 66 - "CompletionFeedbackModal.vue"

Cohesion: 0.10
Nodes (22): api, emit, error, Feedback, handleClose(), handleConfirm(), handleDialogUpdate(), impedimentOptions (+14 more)

### Community 67 - "scripts"

Cohesion: 0.08
Nodes (25): scripts, agent:refactor, build, format, format:check, lint, lint:deps, profile:bubbleprof (+17 more)

### Community 68 - "planning.prompts.ts"

Cohesion: 0.16
Nodes (12): buildCatchballQuestionsPrompt(), buildSmartObjectivePrompt(), buildSuggestAnswerPrompt(), CatchballRequestDto, CatchballResponseDto, PlanWithAIResponseDto, RefineObjectiveDto, SmartObjectiveDto (+4 more)

### Community 69 - ".constructor()"

Cohesion: 0.12
Nodes (10): GanttDataResponse, GanttQueryOptions, InjectModel, GanttService, Injectable, PertDiagramService, Injectable, InjectModel (+2 more)

### Community 70 - "ConversionOptions"

Cohesion: 0.19
Nodes (8): ConversionOptions, ConversionResult, ConvertWbsToTasksParams, GenerateTasksForSingleLeafParams, GenerateTasksForSingleLeafResult, TasksServiceSubset, Injectable, WbsConversionOrchestrationService

### Community 71 - "Backend/tsconfig.json"

Cohesion: 0.08
Nodes (24): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, experimentalDecorators, forceConsistentCasingInFileNames, incremental (+16 more)

### Community 72 - "cytoscape"

Cohesion: 0.08
Nodes (25): cytoscape, cytoscape-popper, dagre, echarts, formdata-polyfill, dependencies, cytoscape, cytoscape-popper (+17 more)

### Community 73 - "GuildDeskBookWidget.vue"

Cohesion: 0.12
Nodes (13): { playPaperFlipSound }, taskStore, urgentTasks, handleCompleteFall(), Props, manualRefresh(), useTaskActions(), ZoomState (+5 more)

### Community 74 - "GuildTopBanner.vue"

Cohesion: 0.08
Nodes (14): emit, useResponsive(), backgroundImageUrl, hoverTooltip, isLeftArchHovered, { isMobile, isPortrait }, { isMuted, toggleMute, playSFX, playDoorOpenSound }, isRightDoorHovered (+6 more)

### Community 75 - "RecurringRuleDto"

Cohesion: 0.16
Nodes (7): RecurringRuleDto, TasksRecurringService, Injectable, InjectModel, assembleOccurrencePayload(), computeParentRecurringId(), normalizeChecklistFromTask()

### Community 76 - "ZoomedContent.vue"

Cohesion: 0.09
Nodes (19): activeIndex, emit, getCurrentTabs(), getPos(), getSheetVars(), habitTabs, handleKeydown(), isFormValid (+11 more)

### Community 77 - "rolling-wave.prompts.ts"

Cohesion: 0.18
Nodes (13): buildPlanWaveGroupingPrompt(), buildPlanWaveStructurePrompt(), RollingWaveAIService, Injectable, extractAndValidateJSON(), sanitizeJSON(), rebalanceWaveDistribution(), AIPlan (+5 more)

### Community 78 - "rtm.controller.ts"

Cohesion: 0.23
Nodes (11): RTMController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Delete (+3 more)

### Community 79 - "CriticalPathAnalysisPanel.vue"

Cohesion: 0.09
Nodes (19): bufferSummary, capacityScenarios, capacitySummary, CpmDiagnostics, criticalNextTasks, cycleAlert, diagnostics, diagnosticsWarning (+11 more)

### Community 80 - "gantt.dto.ts"

Cohesion: 0.19
Nodes (19): GanttDependencyItem, GanttTaskItem, GanttTimeWindow, AdjustWindowBoundsParams, BuildTaskNodesParams, EffectiveEndParams, adjustWindowToBounds(), buildTaskNodes() (+11 more)

### Community 81 - "XMatrix.vue"

Cohesion: 0.09
Nodes (17): annualTaskLookup, annualToTacticalCells, AxisItem, Cell, data, error, generate(), isTaskTruncated (+9 more)

### Community 82 - "PertTab.vue"

Cohesion: 0.10
Nodes (19): { fetch }, likely, optimistic, pertExpected, pertStdDev, PertSuggestionResponse, pertVariance, pessimistic (+11 more)

### Community 83 - "EVMDashboardManualVisibility"

Cohesion: 0.19
Nodes (10): EVMDashboardManualVisibility, EVMDashboardPreferences, EVMDashboardPreferencesInput, RecordProgressParamsDto, ProjectProgressDocument, ProjectProgressSchema, EVMProgressService, Injectable (+2 more)

### Community 84 - "DeterministicProjectInput"

Cohesion: 0.23
Nodes (6): DeterministicProjectInput, ProjectWave, Prop, Schema, RollingWavePlanningService, Injectable

### Community 85 - "FeedbackTab.vue"

Cohesion: 0.11
Nodes (17): decodeEscapedText(), error, feedback, FeedbackField, feedbackFields, feedbackObject, formatFieldValue(), generateFeedback() (+9 more)

### Community 86 - "ActivityGraph.vue"

Cohesion: 0.11
Nodes (16): activityByMonth, activityGrid, currentMonthPage, DayCell, paginatedMonths, props, Task, totalMonthPages (+8 more)

### Community 87 - "ProjectBufferDashboard.vue"

Cohesion: 0.12
Nodes (19): bufferAlerts, bufferColor, bufferColorClass, BufferStatus, consumeBuffer(), consumedCardColor, criticalPathDuration, emit (+11 more)

### Community 88 - "TaskLineagePanel.vue"

Cohesion: 0.12
Nodes (16): breadcrumb, currentTaskId, emit, handleCrumbClick(), LineageLevel, LineageNavigationContext, LineageNode, navigateToTask() (+8 more)

### Community 89 - "components/layout/Sidebar.vue"

Cohesion: 0.11
Nodes (14): emit, handleIconClick(), props, router, sidebarIcons, emit, iconStyle, isActive (+6 more)

### Community 90 - "jest"

Cohesion: 0.11
Nodes (19): jest, collectCoverageFrom, coverageDirectory, coverageReporters, moduleFileExtensions, moduleNameMapper, rootDir, testEnvironment (+11 more)

### Community 91 - "PERTEstimationCard.vue"

Cohesion: 0.11
Nodes (17): coefficientOfVariation, emit, expectedTimeHours, expectedTimeMinutes, hasEstimates, isValid, mostLikelyHours, optimisticHours (+9 more)

### Community 92 - "pert/usePertDiagramData.ts"

Cohesion: 0.19
Nodes (13): PertDiagramDataResponse, PertDiagramEdge, PertDiagramNode, PertDiagramStatistics, usePertDiagramData(), PertNodeInsights, PertTooltipState, BuildPertElementsParams (+5 more)

### Community 93 - "projects-wbs.controller.ts"

Cohesion: 0.29
Nodes (16): AuditLeafDiscrepancyDto, ConvertWBSToTasksDto, GenerateTasksForLeafDto, GenerateWBSDto, GetLeafNodesDto, ResolveWBSBudgetDto, SuggestDecompositionDto, ApiProperty (+8 more)

### Community 94 - "pert-diagram.dto.ts"

Cohesion: 0.26
Nodes (13): PackageCriticalityDto, PertDiagramDataResponse, PertDiagramEdge, PertDiagramNode, PertDiagramStatistics, ApiProperty, ApiPropertyOptional, buildTaskNodes() (+5 more)

### Community 95 - "projects.module.ts"

Cohesion: 0.18
Nodes (12): DashboardMetricPreferences, ProjectSchema, SmartObjective, ProjectWaveSchema, Prop, Schema, XMatrixSnapshot, XMatrixSnapshotDocument (+4 more)

### Community 96 - "projects/index.ts"

Cohesion: 0.13
Nodes (12): eightyWidth, emit, ninetyHeight, openDeleteDialog(), panelRef, props, refreshSizes(), rotatedHeight (+4 more)

### Community 97 - "WBSTreeVisualization.vue"

Cohesion: 0.16
Nodes (15): buildChartOption(), buildTreeData(), chartContainer, emit, getMicroTaskTypeIcon(), getPriorityColor(), handleChartClick(), initChart() (+7 more)

### Community 99 - "rolling-wave.interface.ts"

Cohesion: 0.21
Nodes (15): BuildTaskUpdateOpOptions, BuildWaveSummaryOptions, CalculateEffectiveWaveDatesOptions, CalculateReplannedDeadlinesDto, GenerateBulkOpsForPendingTasksOptions, PendingTasksResult, ProcessWaveReplanOptions, ReplanCalculationResult (+7 more)

### Community 101 - "RiskRegister.vue"

Cohesion: 0.12
Nodes (9): editDialog, headers, loading, mitigationPlan, props, Risk, risks, savingPlan (+1 more)

### Community 102 - "BackgroundDecor.vue"

Cohesion: 0.14
Nodes (9): completedStats, pendingStats, props, filteredTasks, isRefreshing, props, showAllTasks, showMoreAvailable (+1 more)

### Community 103 - "HabitPreview.vue"

Cohesion: 0.13
Nodes (11): descriptionRef, emit, { habit }, handleComplete(), handleSkip(), isDescriptionTruncated, isLoading, isTruncated (+3 more)

### Community 104 - "ChecklistEmbedded.vue"

Cohesion: 0.12
Nodes (12): allItems, ChecklistItem, closeModal(), completedCount, completionPercentage, isLoading, isSaveDisabled, progressColor (+4 more)

### Community 105 - "TaskForm.vue"

Cohesion: 0.12
Nodes (11): emit, formattedDeadline, formattedNotification, isFormValid, isHabitLocal, localDeadline, localNotification, microTaskTypeOptions (+3 more)

### Community 106 - "AIPlanWave"

Cohesion: 0.20
Nodes (15): AIPlanWave, DeterministicTaskInput, DeterministicWbsNodeInput, WbsNodeFlat, balanceWaveTasksOverflow(), balanceWaveTasksUnderflow(), distributeMissingTasks(), findBestDonorIndex() (+7 more)

### Community 107 - "ApplyGuardrailsParams"

Cohesion: 0.23
Nodes (6): ApplyGuardrailsParams, AuditLeafDiscrepancyInput, LeafAuditResult, BatchMetricsResult, AuditService, Injectable

### Community 108 - "wbs.interface.ts"

Cohesion: 0.23
Nodes (5): BudgetValidationSummary, BufferEntry, ValidationResult, Injectable, WbsValidationService

### Community 109 - "GuildDiegeticHotspots.vue"

Cohesion: 0.16
Nodes (11): emit, GoldPopup, goldPopups, isDaggerShaking, onLibraryClick(), onLibraryHover(), onLibraryLeave(), { playCoinsSound, playDaggerSound } (+3 more)

### Community 110 - "GuildLibraryPortal.vue"

Cohesion: 0.17
Nodes (14): cancelAnim(), containerH, currentFrame, emit, isDoorHovered, onDoorClick(), onDoorHover(), onDoorLeave() (+6 more)

### Community 111 - "GuildReceptionDesk.vue"

Cohesion: 0.13
Nodes (13): activeTasksCount, completedTasksCount, isOpen, projectStore, streakDays, taskStore, todoTasksCount, totalProjectsCount (+5 more)

### Community 112 - "autoGenerateRequirements()"

Cohesion: 0.22
Nodes (12): autoGenerateRequirements(), autoMapRequirements(), deleteAllRequirements(), deleteRequirement(), generateTasksForUnmappedRequirements(), loadMatrix(), unmapTask(), errors (+4 more)

### Community 113 - "Paper.vue"

Cohesion: 0.17
Nodes (12): createOrEdit, deadline, deleteAndClose(), editAndClose(), emit, handleHabitComplete(), handleHabitSkip(), handleZoomClick() (+4 more)

### Community 114 - "MicroTaskDetailSection.vue"

Cohesion: 0.13
Nodes (13): ChecklistItem, completionColor, completionPercentage, emit, hasChecklistButIncomplete, pertExpected, pertStdDev, pertVariance (+5 more)

### Community 115 - "DatePickerField.vue"

Cohesion: 0.16
Nodes (13): clearError(), computedLabel, emit, error, errorMessage, formatDate(), inputValue, localValue (+5 more)

### Community 116 - "NextStepsPromptParams"

Cohesion: 0.18
Nodes (4): NextStepsPromptParams, buildGeminiNextStepsPrompt(), SuggestionsAiService, Injectable

### Community 117 - "addDays()"

Cohesion: 0.24
Nodes (13): addDays(), buildTaskScheduleMetrics(), endOfDay(), estimateTaskHours(), startOfDay(), buildUpdateOperationForTask(), buildWaveSummary(), calculateEffectiveWaveDates() (+5 more)

### Community 118 - "cpm-diagnostics.dto.ts"

Cohesion: 0.24
Nodes (13): CPMDiagnosticsDto, CPMValidationDto, MissingDependencySampleDto, SlackBucketsDto, TopBottleneckDto, TopUnlockerDto, ApiProperty, CPMDiagnostics (+5 more)

### Community 119 - "AutoMapRequirementsResponseDto"

Cohesion: 0.28
Nodes (3): AutoMapRequirementsResponseDto, RTMMappingService, Injectable

### Community 120 - "GuildNpcSpeechBubble.vue"

Cohesion: 0.13
Nodes (12): completedCount, currentDialogue, dialogIndex, dialogues, isHovered, isManuallyOpened, isVisible, npcContainerRef (+4 more)

### Community 121 - "LeafDetailsPanel.vue"

Cohesion: 0.19
Nodes (10): emit, { getPriorityColor, getTaskTypeIcon }, emit, { getPriorityColor, getTaskTypeIcon, getBudgetDiffPercentage, getBudgetDiffClass }, expanded, emit, { formatDate }, LeafNode (+2 more)

### Community 122 - "ProjectsPlanningController"

Cohesion: 0.27
Nodes (8): ProjectsPlanningController, ApiOperation, ApiResponse, ApiTags, Body, Controller, Param, Post

### Community 123 - "RiskPage.vue"

Cohesion: 0.14
Nodes (7): assessing, mitigationPlan, props, Risk, risks, savingPlan, selectedRisk

### Community 124 - "DeviationWarningAlert.vue"

Cohesion: 0.15
Nodes (10): adjusting, deviation, DeviationData, dismissed, formValid, loadDeviation(), newPert, Props (+2 more)

### Community 126 - "GuildArchPortal.vue"

Cohesion: 0.19
Nodes (8): emit, emit, emit, handleClick(), props, emit, handleClick(), props

### Community 127 - "BacklogAndProgress.vue"

Cohesion: 0.19
Nodes (11): addIdea(), BacklogIdea, emit, ideas, persistBacklog(), Project, projectTasks, props (+3 more)

### Community 128 - "SmartObjectivesPage.vue"

Cohesion: 0.21
Nodes (10): emit, emitSmartField(), handleObjectiveGenerated(), handleSmartObjectiveUpdated(), local, Project, props, showPlannerDialog (+2 more)

### Community 129 - "ProjectInfoCard.vue"

Cohesion: 0.26
Nodes (10): deadlineRef, emit, { formatDeadline }, onDateClick(), openNativePicker(), statusItems, formatDate(), formatDeadline() (+2 more)

### Community 130 - "RiskRegisterList.vue"

Cohesion: 0.19
Nodes (10): compactHeaders, deleteFromDialog(), detailsDialog, emit, handleRowClick(), openRiskDetails(), Risk, selectedRisk (+2 more)

### Community 131 - "ProjectRow.vue"

Cohesion: 0.15
Nodes (6): barWidth, emit, props, trashLeft, trashSize, props

### Community 132 - "ChecklistTab.vue"

Cohesion: 0.18
Nodes (9): checklistItems, completionPercentage, isItemCompleted(), progressColor, Props, setChecklistItemCompleted(), taskId, taskStore (+1 more)

### Community 133 - "export-graph-html.ts"

Cohesion: 0.17
Nodes (10): dataDir, degreeMap, edges, graphPath, nodeIds, nodeMap, nodes, normalizedNodeMap (+2 more)

### Community 134 - "index-wiki.ts"

Cohesion: 0.24
Nodes (11): generateSimpleEmbedding(), getFilesRecursively(), GraphEdge, GraphNode, IGNORED_PATHS, main(), OUTPUT_DIR, parseMdFile() (+3 more)

### Community 136 - "EVMMetricRelevance"

Cohesion: 0.29
Nodes (11): EVMMetricRelevance, EVMPersonalMetrics, getAutoCompletedHoursVisibility(), getAutoConsistencyVisibility(), getAutoPerceivedProgressVisibility(), getAutoPlanAdherenceVisibility(), getAutoPlannedVsEarnedVisibility(), getAutoRemainingHoursVisibility() (+3 more)

### Community 138 - "GenerateTasksResponseDto"

Cohesion: 0.24
Nodes (6): GenerateTasksResponseDto, RTMAiService, Injectable, RTMTaskGeneratorService, safeStringify(), Injectable

### Community 139 - "SettingsDialog.vue"

Cohesion: 0.18
Nodes (8): dialog, emit, isSilenced, localSettings, props, saveSettings(), saving, { settings, fetchSettings, updateSettings }

### Community 140 - "@google/generative-ai"

Cohesion: 0.31
Nodes (10): @google/generative-ai, auditFile(), countLines(), getTsFiles(), loadEnv(), main(), refactorFile(), rollbackFile() (+2 more)

### Community 141 - ".generatePlan()"

Cohesion: 0.35
Nodes (4): WBSLeafPlanParamsDto, WBSLeafPlanResultDto, DraftPlanGenerationService, Injectable

### Community 142 - "app.controller.ts"

Cohesion: 0.29
Nodes (5): AppController, Controller, Get, AppService, Injectable

### Community 143 - "domain/interfaces/index.ts"

Cohesion: 0.18
Nodes (7): IProjectDomain, ISmartObjective, IChecklistItem, ITaskDomain, ITaskEvmMetrics, ITaskPertEstimate, IWBSNodeDomain

### Community 144 - "ResolutionDialog.vue"

Cohesion: 0.29
Nodes (10): applyAuditSuggestion(), applyResolution(), auditResult, buildAuditResolution(), emit, props, resolutionMode, resolutionProcessing (+2 more)

### Community 145 - ".inferDependencies()"

Cohesion: 0.44
Nodes (6): cleanMarkdown(), extractJsonArray(), extractJsonObject(), extractPartialArray(), repairJsonString(), salvageIncompleteObject()

### Community 146 - "HabitStatsTab.vue"

Cohesion: 0.20
Nodes (9): activeDays, adherenceRate, currentStreak, dailyTarget, longestStreak, Props, totalCompletions, totalSkips (+1 more)

### Community 147 - "Button.vue"

Cohesion: 0.24
Nodes (8): emit, gid(), handleClick(), isPressing, props, pulse, uid, url()

### Community 148 - "ProgressBar.vue"

Cohesion: 0.20
Nodes (7): darkColor, darkerColor, lightColor, lighterColor, mediumColor, projectId, props

### Community 149 - "devDependencies"

Cohesion: 0.22
Nodes (9): devDependencies, clinic, dependency-cruiser, eslint, prettier, eslint, prettier, clinic (+1 more)

### Community 150 - "GuildParticlesCanvas.vue"

Cohesion: 0.36
Nodes (8): canvasRef, createDust(), createEmber(), handleResize(), initParticles(), Particle, particles, render()

### Community 151 - "PERTDisplay.vue"

Cohesion: 0.22
Nodes (8): deadlineClass, expectedTime, formattedDeadline, hasValidPert, Props, showDetails, standardDeviation, teClass

### Community 152 - "DeleteProjectDialog.vue"

Cohesion: 0.25
Nodes (6): confirm(), deleteOption, emit, isMobile, isOpen, props

### Community 153 - "overrides"

Cohesion: 0.25
Nodes (8): overrides, body-parser, fast-uri, file-type, form-data, js-yaml, tmp, tough-cookie

### Community 154 - "ApiProperty"

Cohesion: 0.29
Nodes (6): ApiProperty, IsBoolean, IsNotEmpty, IsOptional, IsString, UpsertDependencyDto

### Community 155 - "tsconfig.build.json"

Cohesion: 0.25
Nodes (7): exclude, extends, dist, node_modules, **/*spec.ts, test, ./tsconfig.json

### Community 156 - "BacklogSection.vue"

Cohesion: 0.32
Nodes (7): addIdea(), BacklogIdea, emit, { formatYMD }, newIdeaText, props, removeIdea()

### Community 157 - "LineageTab.vue"

Cohesion: 0.25
Nodes (7): emit, error, lineage, loading, loadLineage(), Props, taskId

### Community 158 - "scripts"

Cohesion: 0.25
Nodes (8): scripts, analyze, build, dev, generate, postinstall, preview, test:unit

### Community 159 - "Backend/package.json"

Cohesion: 0.29
Nodes (6): author, description, license, name, private, version

### Community 161 - "ModelSelectionDialog.vue"

Cohesion: 0.38
Nodes (6): confirm(), emit, selectedModel, emit, handleCancel(), handleSaveAll()

### Community 162 - "SmartDetailCard.vue"

Cohesion: 0.29
Nodes (5): expanded, hasMore, previewRisks, previewText, props

### Community 163 - "BookShelf.vue"

Cohesion: 0.29
Nodes (4): allBookGroups, bookColors, projectBookGroups, props

### Community 164 - "usePertLayoutFallbacks.ts"

Cohesion: 0.29
Nodes (6): PertLayoutMode, PertResolvedLayoutMode, RunInitialLayoutFallbackParams, RunLayoutFn, RunRecoveryParams, usePertLayoutFallbacks()

### Community 165 - "pert/usePertRouteOptimization.ts"

Cohesion: 0.33
Nodes (5): PertResolvedLayoutMode, RouteOptimizationSummary, Segment, usePertRouteOptimization(), UsePertRouteOptimizationParams

### Community 166 - "nest-cli.json"

Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 167 - "FreshMongoExecuteDto"

Cohesion: 0.53
Nodes (4): FreshMongoExecuteDto, PersistWaveChunkedDto, executeWithFreshMongoClient(), persistWaveIncrementalChunked()

### Community 168 - "GeneralInfoPage.vue"

Cohesion: 0.40
Nodes (5): emit, emitField(), local, Project, props

### Community 169 - "Select.vue"

Cohesion: 0.33
Nodes (5): computedLabel, emit, localValue, props, validationRules

### Community 170 - "TextField.vue"

Cohesion: 0.33
Nodes (5): computedLabel, emit, localValue, props, validationRules

### Community 171 - "Frontend/package.json"

Cohesion: 0.33
Nodes (5): name, overrides, brace-expansion, private, type

### Community 172 - "usePertRenderFinalizer.ts"

Cohesion: 0.40
Nodes (4): ApplyFinalViewportParams, PertResolvedLayoutMode, ResolveLayoutStateResult, usePertRenderFinalizer()

### Community 173 - "usePertRetryCoordinator.ts"

Cohesion: 0.40
Nodes (4): HandleHiddenContainerRetryParams, HandleInvalidGeometryRetryParams, ScheduleTokenRetryParams, usePertRetryCoordinator()

### Community 175 - "EditarTab.vue"

Cohesion: 0.50
Nodes (3): emit, isHabit, Props

### Community 176 - "DescriptionField.vue"

Cohesion: 0.50
Nodes (3): emit, localValue, props

### Community 177 - "Slider.vue"

Cohesion: 0.50
Nodes (3): emit, localValue, props

### Community 178 - "usePertCytoscapeBootstrap.ts"

Cohesion: 0.83
Nodes (3): buildPertGraphStyles(), CytoscapeFactory, usePertCytoscapeBootstrap()

### Community 179 - "usePertRenderFailureState.ts"

Cohesion: 0.50
Nodes (3): ApplyRenderFailureStateParams, PertResolvedLayoutMode, usePertRenderFailureState()

## Knowledge Gaps

- **1140 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `name` (+1135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `TaskDocument` connect `.constructor()` to `.recalculateProjectStats()`, `evm/index.ts`, `UpdateRecurringRuleDto`, `feedback.prompts.ts`, `projects-core.controller.ts`, `.getTaskSuggestions()`, `alerts.controller.ts`, `project.entity.ts`, `x-matrix.dto.ts`, `.generateChecklistForTask()`, `ArrayNotEmpty`, `pert.interface.ts`, `habits.controller.ts`, `pert-estimate.dto.ts`, `hierarchy.dto.ts`, `projects-visualization.controller.ts`, `InjectModel`, `.constructor()`, `RecurringRuleDto`, `gantt.dto.ts`, `DeterministicProjectInput`, `pert-diagram.dto.ts`, `projects.module.ts`, `rolling-wave.interface.ts`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `useApi()` connect `autoGenerateRequirements()` to `tasks/layout/Sidebar.vue`, `GuildDeskBookWidget.vue`, `pert/usePertDiagramData.ts`, `XMatrix.vue`, `RTMMatrix.vue`, `FeedbackTab.vue`, `ProjectBufferDashboard.vue`, `CriticalPathPage.vue`, `PertDiagramPage.vue`, `DeviationWarningAlert.vue`, `LineageTab.vue`, `GanttPage.vue`, `BookModal.vue`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `GeminiService` connect `GeminiService` to `dependency.prompts.ts`, `.constructor()`, `microtask-detail.prompts.ts`, `evm/index.ts`, `feedback.prompts.ts`, `.inferDependencies()`, `.getTaskSuggestions()`, `.generateChecklistForTask()`, `ArrayNotEmpty`, `risk.prompts.ts`, `ai.module.ts`, `rtm.prompts.ts`, `habits.controller.ts`, `pert-estimate.dto.ts`, `planning.prompts.ts`, `rolling-wave.prompts.ts`, `GeminiExecutorService`, `NextStepsPromptParams`, `.suggestPertEstimates()`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _1140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `.generateContent()` be split into smaller, more focused modules?**
  _Cohesion score 0.07256235827664399 - nodes in this community are weakly interconnected._
- **Should `prompt-builder.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06768388106416276 - nodes in this community are weakly interconnected._
- **Should `audit.prompts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06233538191395961 - nodes in this community are weakly interconnected._
