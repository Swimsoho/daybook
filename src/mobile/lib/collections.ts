import type { Entry, Tracker, TrackerColumn } from '@/lib/model';
import { nextOccurrence, daysBetween, today } from '@/lib/model';

/**
 * Collections helpers.
 *
 * Note the field names come from the platform model: a column is keyed by
 * `key` (not `id`), and `showWhen.equals` is a single string (not a list).
 */

export function titleColumn(tracker: Tracker): TrackerColumn | undefined {
  return tracker.columns.find((c) => c.isTitle) ?? tracker.columns[0];
}

export function entryTitle(tracker: Tracker, entry: Entry): string {
  const col = titleColumn(tracker);
  const value = col ? entry.values[col.key] : undefined;
  return value ? String(value) : 'Untitled';
}

/** the status column drives the board view's kanban lanes */
export function statusColumn(tracker: Tracker): TrackerColumn | undefined {
  return tracker.columns.find((c) => c.type === 'status');
}

/**
 * Conditional visibility — a column with a `showWhen` rule only renders once
 * the target column holds the matching value.
 */
export function isColumnVisible(column: TrackerColumn, values: Entry['values']): boolean {
  if (!column.showWhen) return true;
  const target = values[column.showWhen.columnKey];
  if (target === null || target === undefined) return false;
  const asString = typeof target === 'boolean' ? (target ? 'yes' : 'no') : String(target);
  return asString === column.showWhen.equals;
}

export function visibleColumns(tracker: Tracker, values: Entry['values']): TrackerColumn[] {
  return tracker.columns.filter((c) => isColumnVisible(c, values));
}

export function formatValue(column: TrackerColumn, value: Entry['values'][string]): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (column.type) {
    case 'currency':
      return typeof value === 'number'
        ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)
        : String(value);
    case 'checkbox':
      return value ? 'Yes' : 'No';
    case 'rating':
      return '★'.repeat(Number(value)) + '☆'.repeat(Math.max(0, 5 - Number(value)));
    case 'multiselect':
      return Array.isArray(value) && value.length ? value.join(', ') : '—';
    case 'date':
      return new Date(String(value) + 'T12:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    default:
      return String(value);
  }
}

/** a blank record shaped by the tracker's columns */
export function emptyValues(tracker: Tracker): Entry['values'] {
  const values: Entry['values'] = {};
  for (const column of tracker.columns) {
    if (column.type === 'multiselect') values[column.key] = [];
    else if (column.type === 'checkbox') values[column.key] = false;
    else if (column.type === 'status' || column.type === 'select') {
      values[column.key] = column.options?.[0] ?? '';
    } else values[column.key] = '';
  }
  return values;
}

/**
 * Days until a date's next occurrence. Uses the platform's own
 * `nextOccurrence`, so a recurring birthday rolls forward from whatever year is
 * on file exactly as it does on the web.
 */
export function daysUntil(iso: string, repeatsYearly: boolean): number | null {
  if (!iso) return null;
  const next = nextOccurrence(iso, repeatsYearly);
  if (!next) return null;
  const days = daysBetween(today(), next);
  return Number.isNaN(days) ? null : days;
}
