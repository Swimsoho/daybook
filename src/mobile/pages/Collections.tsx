import { ChevronRight, LayoutGrid, Rows3, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMemo, useState } from 'react';
import { BottomSheet, SheetTitle } from '@/mobile/components/BottomSheet';
import {
  EmptyState,
  Field,
  OutlineButton,
  PrimaryButton,
  SectionTitle,
  inputClass,
  textareaClass,
} from '@/mobile/components/bits';
import {
  emptyValues,
  entryTitle,
  formatValue,
  statusColumn,
  titleColumn,
  visibleColumns,
} from '@/mobile/lib/collections';
import { useStore } from '@/lib/store';
import type { Entry, Tracker, TrackerColumn } from '@/lib/model';

type TrackerView = Tracker['defaultView'];

/**
 * Collections (feature manual §10) — user-defined trackers for anything that
 * isn't a task. Collections group Trackers; each Tracker defines its own
 * columns and holds Entries, viewable as a table, a kanban board driven by the
 * status column, or a gallery.
 *
 * Mobile note: the desktop "table" view is a wide sortable grid. A phone can't
 * show eight columns, so table here is a dense stacked list — same data, same
 * column order, one entry per card. Board and gallery translate directly.
 */
export function Collections() {
  const { state } = useStore();
  const { collections, trackers } = state;
  const [openTrackerId, setOpenTrackerId] = useState<string | null>(null);

  const tracker = trackers.find((t) => t.id === openTrackerId) ?? null;
  if (tracker) {
    return <TrackerScreen tracker={tracker} onBack={() => setOpenTrackerId(null)} />;
  }

  return (
    <div>
      {collections.map((collection) => {
        const owned = trackers.filter((t) => t.collectionId === collection.id);
        return (
          <div key={collection.id} className="mb-6">
            <SectionTitle className="mb-[10px]">{collection.name}</SectionTitle>
            {owned.length === 0 ? (
              <p className="text-[12px] italic opacity-55">No trackers yet.</p>
            ) : (
              owned.map((t) => <TrackerRow key={t.id} tracker={t} onOpen={setOpenTrackerId} />)
            )}
          </div>
        );
      })}

      <p className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">
        Trackers, their fields and conditional rules are configured in Settings on
        the web app. This build reads that structure and lets you work the
        entries.
      </p>
    </div>
  );
}

function TrackerRow({ tracker, onOpen }: { tracker: Tracker; onOpen: (id: string) => void }) {
  const { state } = useStore();
  const count = state.entries.filter((e) => e.trackerId === tracker.id).length;

  return (
    <button
      type="button"
      onClick={() => onOpen(tracker.id)}
      className="flex w-full items-center gap-3 py-[11px] text-left active:opacity-70"
      style={{ borderBottom: '1px solid hsl(var(--border))' }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{tracker.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {count} {count === 1 ? 'entry' : 'entries'} · {tracker.columns.length} fields
        </div>
      </div>
      <ChevronRight size={16} className="shrink-0 opacity-40" />
    </button>
  );
}

const VIEW_ICONS: Record<TrackerView, typeof Table2> = {
  table: Rows3,
  board: Table2,
  gallery: LayoutGrid,
};

function TrackerScreen({
  tracker,
  onBack,
}: {
  tracker: Tracker;
  onBack: () => void;
}) {
  const { state, addEntry, updateEntry } = useStore();
  const { entries } = state;
  const [view, setView] = useState<TrackerView>(tracker.defaultView);
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);

  const rows = useMemo(
    () => entries.filter((e) => e.trackerId === tracker.id),
    [entries, tracker.id],
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[14px] border border-border px-3 py-[5px] text-[11.5px] font-semibold active:opacity-70"
        >
          ← All trackers
        </button>
        <span className="ml-auto flex gap-1 rounded-[9px] border border-border p-[2px]">
          {(['table', 'board', 'gallery'] as TrackerView[]).map((v) => {
            const Icon = VIEW_ICONS[v];
            const active = v === view;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-label={`${v} view`}
                aria-pressed={active}
                className="rounded-[7px] p-[6px]"
                style={{
                  background: active ? 'hsl(var(--primary))' : 'transparent',
                  color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                }}
              >
                <Icon size={15} strokeWidth={2} />
              </button>
            );
          })}
        </span>
      </div>

      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display m-0 text-[19px] font-semibold">{tracker.name}</h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="shrink-0 rounded-[14px] border-none bg-primary px-3 py-[6px] text-[12px] font-semibold text-primary-foreground active:opacity-80"
        >
          + Entry
        </button>
      </div>

      {rows.length === 0 ? <EmptyState>Nothing in here yet.</EmptyState> : null}

      {view === 'table' ? <TableView tracker={tracker} rows={rows} onOpen={setEditing} /> : null}
      {view === 'board' ? <BoardView tracker={tracker} rows={rows} onOpen={setEditing} /> : null}
      {view === 'gallery' ? <GalleryView tracker={tracker} rows={rows} onOpen={setEditing} /> : null}

      {editing ? (
        <EntrySheet
          tracker={tracker}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(values) => {
            if (editing === 'new') {
              addEntry(tracker.id, values);
              toast.success('Entry added');
            } else {
              updateEntry(editing.id, values);
              toast.success('Saved');
            }
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ── views ────────────────────────────────────────────────────────────────── */

function TableView({
  tracker,
  rows,
  onOpen,
}: {
  tracker: Tracker;
  rows: Entry[];
  onOpen: (entry: Entry) => void;
}) {
  const title = titleColumn(tracker);
  return (
    <div>
      {rows.map((entry) => {
        const cols = visibleColumns(tracker, entry.values).filter((c) => c.key !== title?.key);
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry)}
            className="mb-[10px] block w-full rounded-[10px] border border-border bg-card p-3 text-left active:opacity-70"
          >
            <div className="mb-[6px] text-[13.5px] font-semibold">{entryTitle(tracker, entry)}</div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {cols.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
                    {c.name}
                    {c.showWhen ? <span title="conditional field">*</span> : null}
                  </dt>
                  <dd className="m-0 truncate text-[12px]">{formatValue(c, entry.values[c.key])}</dd>
                </div>
              ))}
            </dl>
          </button>
        );
      })}
    </div>
  );
}

function BoardView({
  tracker,
  rows,
  onOpen,
}: {
  tracker: Tracker;
  rows: Entry[];
  onOpen: (entry: Entry) => void;
}) {
  const status = statusColumn(tracker);

  if (!status) {
    return (
      <p className="text-[12px] italic leading-[1.5] opacity-60">
        This tracker has no status field, so there are no board lanes to build.
        Add one in Settings, or use the table or gallery view.
      </p>
    );
  }

  const lanes = status.options ?? [];

  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
      {lanes.map((lane) => {
        const inLane = rows.filter((e) => String(e.values[status.key] ?? '') === lane);
        return (
          <div key={lane} className="w-[220px] shrink-0">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]">{lane}</span>
              <span className="text-[11px] text-muted-foreground">{inLane.length}</span>
            </div>
            {inLane.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onOpen(entry)}
                className="mb-2 block w-full rounded-[10px] border border-border bg-card p-[10px] text-left text-[12.5px] font-semibold active:opacity-70"
              >
                {entryTitle(tracker, entry)}
              </button>
            ))}
            {inLane.length === 0 ? (
              <p className="text-[11px] italic opacity-45">Empty</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function GalleryView({
  tracker,
  rows,
  onOpen,
}: {
  tracker: Tracker;
  rows: Entry[];
  onOpen: (entry: Entry) => void;
}) {
  const title = titleColumn(tracker);
  return (
    <div className="grid grid-cols-2 gap-[10px]">
      {rows.map((entry) => {
        const secondary = visibleColumns(tracker, entry.values)
          .filter((c) => c.key !== title?.key && c.type !== 'longtext')
          .slice(0, 2);
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry)}
            className="rounded-[10px] border border-border bg-card p-3 text-left active:opacity-70"
          >
            <div className="mb-2 text-[13px] font-semibold leading-tight">
              {entryTitle(tracker, entry)}
            </div>
            {secondary.map((c) => (
              <div key={c.key} className="truncate text-[11px] text-muted-foreground">
                {formatValue(c, entry.values[c.key])}
              </div>
            ))}
          </button>
        );
      })}
    </div>
  );
}

/* ── add / edit entry ─────────────────────────────────────────────────────── */

function EntrySheet({
  tracker,
  entry,
  onClose,
  onSave,
}: {
  tracker: Tracker;
  entry: Entry | null;
  onClose: () => void;
  onSave: (values: Entry['values']) => void;
}) {
  const [values, setValues] = useState<Entry['values']>(
    () => entry?.values ?? emptyValues(tracker),
  );
  const [error, setError] = useState<string | null>(null);

  const set = (columnId: string, value: Entry['values'][string]) =>
    setValues((v) => ({ ...v, [columnId]: value }));

  const submit = () => {
    // required only applies to fields the conditional rules actually show
    const shown = visibleColumns(tracker, values);
    const missing = shown.find((c) => c.required && !values[c.key]);
    if (missing) {
      setError(`${missing.name} is required`);
      return;
    }
    onSave(values);
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      height="86%"
      title={<SheetTitle>{entry ? 'Edit entry' : `New ${tracker.name} entry`}</SheetTitle>}
    >
      {visibleColumns(tracker, values).map((column) => (
        <ColumnInput key={column.key} column={column} value={values[column.key]} onChange={set} />
      ))}

      {error ? (
        <p className="mb-2 text-[12px] font-semibold" style={{ color: 'hsl(8 60% 41%)' }}>
          {error}
        </p>
      ) : null}

      <div className="mt-1 flex gap-[10px]">
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <PrimaryButton onClick={submit}>{entry ? 'Save' : 'Add'}</PrimaryButton>
      </div>

      <p className="mt-3 text-center text-[10.5px] leading-[1.5] text-muted-foreground">
        Deleting an entry, and editing a tracker's fields, live on the desktop
        layout — fiddly enough to be worth the bigger screen.
      </p>
    </BottomSheet>
  );
}

function ColumnInput({
  column,
  value,
  onChange,
}: {
  column: TrackerColumn;
  value: Entry['values'][string];
  onChange: (columnId: string, value: Entry['values'][string]) => void;
}) {
  const label = `${column.name}${column.required ? ' *' : ''}`;

  switch (column.type) {
    case 'longtext':
      return (
        <Field label={label}>
          <textarea
            value={String(value ?? '')}
            onChange={(e) => onChange(column.key, e.target.value)}
            className={textareaClass}
          />
        </Field>
      );

    case 'number':
    case 'currency':
      return (
        <Field label={label}>
          <input
            type="number"
            inputMode="decimal"
            step={column.type === 'currency' ? '0.01' : '1'}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(column.key, e.target.value === '' ? '' : Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      );

    case 'date':
      return (
        <Field label={label}>
          <input
            type="date"
            value={String(value ?? '')}
            onChange={(e) => onChange(column.key, e.target.value)}
            className={inputClass}
          />
        </Field>
      );

    case 'url':
      return (
        <Field label={label}>
          <input
            type="url"
            inputMode="url"
            placeholder="https://"
            value={String(value ?? '')}
            onChange={(e) => onChange(column.key, e.target.value)}
            className={inputClass}
          />
        </Field>
      );

    case 'checkbox':
      return (
        <label className="mb-3 flex items-center gap-[10px]">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(column.key, e.target.checked)}
            className="h-[18px] w-[18px] accent-[hsl(var(--primary))]"
          />
          <span className="text-[13px] font-semibold">{column.name}</span>
        </label>
      );

    case 'rating':
      return (
        <Field label={label}>
          <div className="mb-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                onClick={() => onChange(column.key, Number(value) === n ? '' : n)}
                className="text-[22px] leading-none"
                style={{ color: Number(value) >= n ? 'hsl(40 80% 45%)' : 'hsl(var(--border))' }}
              >
                ★
              </button>
            ))}
          </div>
        </Field>
      );

    case 'select':
    case 'status':
      return (
        <Field label={label}>
          <select
            value={String(value ?? '')}
            onChange={(e) => onChange(column.key, e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {(column.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      );

    case 'multiselect': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <Field label={label}>
          <div className="mb-3 flex flex-wrap gap-[6px]">
            {(column.options ?? []).map((o) => {
              const on = selected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() =>
                    onChange(column.key, on ? selected.filter((x) => x !== o) : [...selected, o])
                  }
                  className="rounded-[14px] border px-[10px] py-[5px] text-[11.5px] font-semibold"
                  style={{
                    borderColor: on ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    background: on ? 'hsl(var(--primary))' : 'transparent',
                    color: on ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                  }}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </Field>
      );
    }

    default:
      return (
        <Field label={label}>
          <input
            value={String(value ?? '')}
            onChange={(e) => onChange(column.key, e.target.value)}
            className={inputClass}
          />
        </Field>
      );
  }
}
