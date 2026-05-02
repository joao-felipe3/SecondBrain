// Frontend Manual QA Checklist for Sprint 4: Kanban + Rastreabilidade

/**
 * BEFORE STARTING:
 * - Ensure Backend is running on localhost:3000
 * - Ensure Frontend dev server is running on localhost:3000 (or configured port)
 * - Have a test project with 5+ tasks created
 * - Open browser DevTools (F12) to check for console errors
 */

export const SPRINT4_QA_CHECKLIST = {
  'A. Kanban Board Interaction': [
    {
      testCase: 'A1. Render Kanban board with 4 columns',
      steps: [
        '1. Navigate to Kanban board view',
        '2. Verify 4 columns visible: ToDo, Fazendo, Revisão, Concluído',
        '3. Verify each column shows title + task count badge',
      ],
      expectedResult: 'All 4 columns render correctly with proper labels',
      status: '⬜ Not Started',
    },
    {
      testCase: 'A2. Drag task by handle only',
      steps: [
        '1. Click and hold on a task card (NOT on the handle)',
        '2. Verify no drag starts (no visual feedback)',
        '3. Click and hold on the drag handle icon',
        '4. Verify drag starts (card becomes slightly transparent/highlighted)',
        '5. Drag over another column and release',
      ],
      expectedResult: 'Drag only initiates from handle, not from rest of card',
      status: '⬜ Not Started',
    },
    {
      testCase: 'A3. Drop task in destination column',
      steps: [
        '1. Drag task from ToDo to Fazendo',
        '2. Verify card moves to Fazendo column',
        '3. Verify API call was made (check Network tab)',
        '4. Verify loading state during API call',
      ],
      expectedResult: 'Task moves to column, API updates status on backend',
      status: '⬜ Not Started',
    },
    {
      testCase: 'A4. Kanban persists after page refresh',
      steps: [
        '1. Move task from ToDo to Fazendo',
        '2. Verify task appears in Fazendo column',
        '3. Refresh page (F5 or Ctrl+R)',
        '4. Verify task is still in Fazendo column (not back in ToDo)',
      ],
      expectedResult: 'Status persists across browser refresh',
      status: '⬜ Not Started',
    },
    {
      testCase: 'A5. Board locks while zoom is open',
      steps: [
        '1. Click on a task card (outside handle)',
        '2. Verify zoom overlay opens with animation',
        '3. Try to drag another card while zoom is open',
        '4. Verify drag does NOT work (cursor shows "not allowed")',
        '5. Close zoom (click close button or outside)',
        '6. Try to drag a card again',
        '7. Verify drag works again',
      ],
      expectedResult: 'DnD disabled while zoom open, re-enabled after close',
      status: '⬜ Not Started',
    },
  ],

  'B. Zoom Overlay Tabs': [
    {
      testCase: 'B1. Lineage Tab shows ancestors and children',
      steps: [
        '1. Open task zoom',
        '2. Click "Genealogia" tab (🔗 icon)',
        '3. Verify ancestor chain displays (if task has parent)',
        '4. Verify direct children list displays (if task has children)',
        '5. Verify each ancestor/child shows name and link',
      ],
      expectedResult: 'Lineage tab displays genealogy correctly',
      status: '⬜ Not Started',
    },
    {
      testCase: 'B2. Value Tab shows task metrics',
      steps: [
        '1. Open task zoom',
        '2. Click "Valor" tab (⭐ icon)',
        '3. Verify EVM metrics if available',
        '4. Verify difficulty and priority badges',
      ],
      expectedResult: 'Value tab displays all metrics without errors',
      status: '⬜ Not Started',
    },
    {
      testCase: 'B3. Feedback Tab shows completion feedback',
      steps: [
        '1. Open task zoom for an unconcluded task',
        '2. Click "Feedback" tab (💬 icon)',
        '3. Verify "Gerar Novo" button is visible',
        '4. Click button and wait for feedback generation',
        '5. Verify feedback text displays (2-3 lines Portuguese)',
        '6. Verify loading state during generation',
      ],
      expectedResult: 'Feedback generates on demand with proper UI states',
      status: '⬜ Not Started',
    },
    {
      testCase: 'B4. Feedback Tab for concluded task',
      steps: [
        '1. Open task zoom for a concluded task (status=done)',
        '2. Click "Feedback" tab',
        '3. Verify last feedback is displayed if exists',
        '4. Verify "Gerar Novo" button available to regenerate',
      ],
      expectedResult: 'Concluded tasks show existing feedback + regenerate option',
      status: '⬜ Not Started',
    },
  ],

  'C. Status Transitions': [
    {
      testCase: 'C1. Move task: ToDo → Fazendo',
      steps: [
        '1. Drag task from ToDo column to Fazendo',
        '2. Verify status change in card (if displayed)',
        '3. Check Network tab for PATCH request to /tasks/:id/status',
        '4. Verify request body contains { status: "doing" }',
      ],
      expectedResult: 'Status transitions correctly, API called with right payload',
      status: '⬜ Not Started',
    },
    {
      testCase: 'C2. Move task: Fazendo → Revisão',
      steps: [
        '1. Drag task from Fazendo to Revisão',
        '2. Verify it appears in Revisão column',
        '3. Check API request (should have status: "review")',
      ],
      expectedResult: 'Task moves to Revisão correctly',
      status: '⬜ Not Started',
    },
    {
      testCase: 'C3. Move task: Revisão → Concluído (with complete checklist)',
      steps: [
        '1. Open task with COMPLETE checklist (100%)',
        '2. Drag to Concluído column',
        '3. Verify task moves to Concluído',
        '4. Verify isConcluded flag is set (check response)',
      ],
      expectedResult: 'Task moves to Concluído and is marked as concluded',
      status: '⬜ Not Started',
    },
    {
      testCase: 'C4. Block move to Concluído if checklist incomplete',
      steps: [
        '1. Open task with INCOMPLETE checklist (< 100%)',
        '2. Try to drag to Concluído',
        '3. Verify error toast/notification appears',
        '4. Verify task stays in current column (not moved)',
        '5. Read error message (should mention checklist %)',
      ],
      expectedResult: 'Incomplete checklist blocks move to Concluído with error msg',
      status: '⬜ Not Started',
    },
    {
      testCase: 'C5. Allow skip-stage transitions (e.g., ToDo → Revisão directly)',
      steps: [
        '1. Drag task directly from ToDo to Revisão (skip Fazendo)',
        '2. Verify move succeeds',
        '3. Verify no error or blocking',
      ],
      expectedResult: 'Skip-stage transitions allowed (no linear constraint)',
      status: '⬜ Not Started',
    },
  ],

  'D. Error Handling': [
    {
      testCase: 'D1. Network error on status move',
      steps: [
        '1. Open DevTools Network tab',
        '2. Throttle to "Offline" or use "Block request" for /tasks/:id/status',
        '3. Drag task to another column',
        '4. Verify error toast displays',
        '5. Verify task stays in original column (optimistic update rolled back)',
      ],
      expectedResult: 'Network errors are handled gracefully with user feedback',
      status: '⬜ Not Started',
    },
    {
      testCase: 'D2. Invalid status value (edge case)',
      steps: [
        '1. Open DevTools console',
        '2. Manually call store: this.$store.dispatch("setTaskStatus", { id: "...", status: "invalid" })',
        '3. Verify API returns 400 error',
        '4. Verify frontend handles error (shows toast, reverts state)',
      ],
      expectedResult: 'Invalid status rejected with proper error handling',
      status: '⬜ Not Started',
    },
  ],

  'E. Performance & UX': [
    {
      testCase: 'E1. Kanban renders 20+ tasks smoothly',
      steps: [
        '1. Create 20+ tasks in different statuses',
        '2. Open Kanban board',
        '3. Verify all tasks render (scroll if needed)',
        '4. Drag tasks and verify no lag',
        '5. Open DevTools Performance tab',
        '6. Record performance while dragging multiple times',
        '7. Verify frame rate stays above 30fps (ideally 60fps)',
      ],
      expectedResult: 'No lag or stuttering with 20+ tasks, smooth animations',
      status: '⬜ Not Started',
    },
    {
      testCase: 'E2. Zoom animation smooth',
      steps: [
        '1. Click on task to open zoom',
        '2. Verify animation is smooth (clone grows/shrinks smoothly)',
        '3. No jank or flicker during animation',
      ],
      expectedResult: 'Zoom animation is smooth and professional',
      status: '⬜ Not Started',
    },
  ],

  'F. Integration Tests': [
    {
      testCase: 'F1. Full flow: Create → Move → Lineage → Feedback',
      steps: [
        '1. Create new task in project',
        '2. Verify it appears in ToDo column with status=todo',
        '3. Drag to Fazendo',
        '4. Click card to open zoom',
        '5. Check Lineage tab (should show parent if nested)',
        '6. Check Value tab (should show metrics)',
        '7. Check Feedback tab (should allow generation)',
        '8. Close zoom, refresh page',
        '9. Verify task is still in Fazendo (persistence)',
      ],
      expectedResult: 'Full flow works end-to-end without errors',
      status: '⬜ Not Started',
    },
    {
      testCase: 'F2. Multiple users workflow simulation',
      steps: [
        '1. Open same project in 2 browser tabs',
        '2. In tab A: drag task from ToDo to Fazendo',
        '3. In tab B: refresh page',
        '4. Verify tab B shows task in Fazendo (reflects change from tab A)',
      ],
      expectedResult: 'State sync works across browser instances',
      status: '⬜ Not Started',
    },
  ],

  'G. Accessibility & Mobile': [
    {
      testCase: 'G1. Keyboard navigation in Kanban',
      steps: [
        '1. Tab through task cards (should be focusable)',
        '2. Tab to Lineage/Value/Feedback tabs (should be focusable)',
        '3. Use arrow keys to navigate (if implemented)',
      ],
      expectedResult: 'Keyboard navigation works for accessibility',
      status: '⬜ Not Started',
    },
    {
      testCase: 'G2. Mobile responsiveness',
      steps: [
        '1. Open Kanban on mobile/tablet (use DevTools device emulation)',
        '2. Verify columns stack vertically or scroll horizontally',
        '3. Verify drag-and-drop works on touch',
        '4. Verify zoom animation works on mobile',
      ],
      expectedResult: 'Kanban is usable on mobile devices',
      status: '⬜ Not Started',
    },
  ],
};

/**
 * REPORTING:
 * After testing, update status for each test case:
 * ⬜ Not Started
 * 🟡 In Progress
 * 🟩 Passed
 * 🔴 Failed (document issue)
 * 
 * Document any bugs found with:
 * - Steps to reproduce
 * - Expected vs actual result
 * - Browser/environment info
 * - Screenshots/console errors if applicable
 */

export const BUGS_FOUND = [
  // {
  //   testCase: 'A2. Drag task by handle only',
  //   severity: 'Medium',
  //   title: 'Drag initiates from card body, not just handle',
  //   stepsToReproduce: '1. Click on card (not handle) 2. Try to drag',
  //   expectedVsActual: 'Should not drag; Actually initiates drag from anywhere',
  //   browser: 'Chrome 120',
  // },
];
