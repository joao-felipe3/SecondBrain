export class MoveTaskStatusDto {
  status!: 'todo' | 'doing' | 'review' | 'done';
  /** Optional absolute kanbanOrder to set on the destination column */
  toOrder?: number;
  /** Optional index position within destination column (0-based). When provided, service will compute an order between neighboring items. */
  toIndex?: number;
  /** Optional source status (helpful for optimistic UI) */
  fromStatus?: 'todo' | 'doing' | 'review' | 'done';
  /** Optional source order value (optimistic) */
  fromOrder?: number;
}
