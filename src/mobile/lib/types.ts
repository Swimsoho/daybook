/**
 * UI-only types.
 *
 * The data model lives in `src/platform/model.ts`, copied verbatim from the web
 * app. Nothing describing a task, person, project or entry belongs in this file
 * — that was the mistake this build started with.
 */

export type TabId = 'today' | 'inbox' | 'tasks' | 'people' | 'more';

export type TaskFilter = 'open' | 'today' | 'overdue' | 'p0' | 'waiting' | 'done';

export type SubPage =
  | 'overall'
  | 'projects'
  | 'collections'
  | 'reports'
  | 'history'
  | 'settings';
