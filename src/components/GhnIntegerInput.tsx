import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { deleteGhnIntegerSeparator, editGhnIntegerInput, parseGhnIntegerInput, pasteGhnIntegerInput } from '@/lib/ghn-integer-input';

type Props = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'min' | 'max'> & {
  value: string;
  min: number;
  max: number;
  onValueChange: (text: string) => void;
  onComposingChange: (composing: boolean) => void;
};

/** Only GHN gram/money fields use this strict, caret-preserving integer editor. */
export function GhnIntegerInput({ value, min, max, onValueChange, onComposingChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null), composing = useRef(false);
  const pendingCaret = useRef<number | null>(null);
  const compositionStart = useRef<{ value: string; start: number; end: number } | null>(null);
  const expectedValue = useRef(value);
  useLayoutEffect(() => {
    // A reset supplied by the owner cancels the old IME transaction.
    if (composing.current && value !== expectedValue.current) {
      composing.current = false; compositionStart.current = null; onComposingChange(false);
    }
    if (!composing.current) expectedValue.current = value;
    if (pendingCaret.current !== null && input.current === document.activeElement) input.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });
  useLayoutEffect(() => () => {
    if (composing.current) onComposingChange(false);
  }, [onComposingChange]);
  const commit = (edit: { text: string; caret: number }) => {
    pendingCaret.current = edit.caret;
    expectedValue.current = edit.text;
    onValueChange(edit.text);
    // Same-value edits (e.g. a removed grouping dot) also need their caret restored.
    if (edit.text === value) input.current?.setSelectionRange(edit.caret, edit.caret);
  };
  return <Input {...props} ref={input} type="text" inputMode="numeric" value={value} aria-invalid={composing.current || parseGhnIntegerInput(value, min, max) === null}
    onChange={event => {
      const text = event.currentTarget.value, caret = event.currentTarget.selectionStart ?? text.length;
      if (composing.current) { expectedValue.current = text; onValueChange(text); return; }
      commit(editGhnIntegerInput(value, text, caret, (event.nativeEvent as InputEvent).inputType));
    }}
    onPaste={event => {
      if (composing.current) return;
      event.preventDefault();
      commit(pasteGhnIntegerInput(value, event.clipboardData.getData('text'), event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? value.length));
    }}
    onKeyDown={event => {
      if (composing.current || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return;
      const edit = deleteGhnIntegerSeparator(value, event.currentTarget.selectionStart ?? 0, event.key);
      if (edit) { event.preventDefault(); commit(edit); }
    }}
    onCompositionStart={event => {
      compositionStart.current = { value, start: event.currentTarget.selectionStart ?? value.length, end: event.currentTarget.selectionEnd ?? value.length };
      expectedValue.current = value; composing.current = true; onComposingChange(true);
    }}
    onCompositionEnd={event => {
      if (!composing.current) return;
      const before = compositionStart.current, text = event.currentTarget.value, caret = event.currentTarget.selectionStart ?? text.length;
      const prefix = before?.value.slice(0, before.start) ?? '', suffix = before?.value.slice(before.end) ?? '';
      // Only normalize digit edits inside the original selection. An IME may
      // also produce decimal/sign/exponent text, which must remain invalid.
      const withinSelection = before && text.startsWith(prefix) && text.endsWith(suffix) && text.length >= prefix.length + suffix.length;
      const inserted = withinSelection ? text.slice(prefix.length, text.length - suffix.length) : null;
      composing.current = false;
      compositionStart.current = null;
      onComposingChange(false);
      commit(editGhnIntegerInput(before?.value ?? value, text, caret, inserted !== null && /^\d*$/.test(inserted) ? 'insertText' : ''));
    }}
  />;
}
