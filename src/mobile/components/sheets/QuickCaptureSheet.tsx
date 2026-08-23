import { Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet, SheetTitle } from '@/mobile/components/BottomSheet';
import { PrimaryButton } from '@/mobile/components/bits';

const PREFIXES: { key: string; label: string }[] = [
  { key: 't', label: 't: task' },
  { key: 'c', label: 'c: call' },
  { key: 'i', label: 'i: idea' },
  { key: 'n', label: 'n: note' },
];

/**
 * Quick capture — the FAB target. Capture first, organise later: this only ever
 * appends to the Inbox, it never asks the user to categorise anything.
 */
export function QuickCaptureSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [voiceOn, setVoiceOn] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setVoiceOn(false);
      // let the sheet finish its slide before stealing focus
      const t = window.setTimeout(() => ref.current?.focus(), 200);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const applyPrefix = (key: string) =>
    setText((t) => `${key}: ${t.replace(/^[a-z?]+:\s*/i, '')}`);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <BottomSheet open={open} onClose={onClose} height="52%" title={<SheetTitle>Quick capture</SheetTitle>}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="What's on your mind?"
        className="mb-3 min-h-[96px] w-full resize-none rounded-[7px] border border-border bg-card px-[10px] py-[9px] text-[13px] outline-none focus:border-primary"
      />

      <div className="mb-3 flex flex-wrap gap-[6px]">
        {PREFIXES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPrefix(p.key)}
            className="rounded-[12px] border border-border bg-transparent px-[10px] py-[5px] text-[11px] text-muted-foreground active:opacity-70"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          onClick={() => setVoiceOn((v) => !v)}
          aria-label={voiceOn ? 'Stop recording' : 'Record a voice capture'}
          aria-pressed={voiceOn}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border"
          style={{
            background: voiceOn ? 'hsl(8 60% 47%)' : 'transparent',
            color: voiceOn ? '#fff' : 'hsl(var(--foreground))',
          }}
        >
          <Mic size={17} strokeWidth={2} />
        </button>
        <PrimaryButton onClick={submit}>Capture</PrimaryButton>
      </div>

      {voiceOn ? (
        <p className="mt-3 text-center text-[11.5px] italic text-muted-foreground">
          Recording is a visual state only — wire this to the real speech-to-text
          capture path before shipping.
        </p>
      ) : null}
    </BottomSheet>
  );
}
