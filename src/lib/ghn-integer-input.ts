/** GHN accepts integer grams/VND. Dots are thousands separators, never fractions. */
export function ghnIntegerDigits(text: string): string | null {
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return null;
  return text.replace(/\./g, '');
}

export function parseGhnIntegerInput(text: string, min: number, max: number): number | null {
  const digits = ghnIntegerDigits(text);
  if (digits === null) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

export function formatGhnIntegerInput(text: string): string {
  const digits = ghnIntegerDigits(text);
  return digits === null ? text : digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export const ghnDigitOffset = (text: string, caret: number) => (text.slice(0, caret).match(/\d/g) || []).length;
export function ghnCaretAtDigit(text: string, offset: number): number {
  if (offset <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index++) if (/\d/.test(text[index]) && ++seen === offset) return index + 1;
  return text.length;
}

/** Native digit edits may temporarily leave old grouping dots out of place. */
export function editGhnIntegerInput(previous: string, next: string, caret: number, inputType = '') {
  let candidate = next;
  if (ghnIntegerDigits(previous) !== null && /^(?:insertText|deleteContentBackward|deleteContentForward|deleteByCut)$/.test(inputType)) {
    let prefix = 0, suffix = 0;
    while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++;
    while (suffix < previous.length - prefix && suffix < next.length - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
    const inserted = next.slice(prefix, next.length - suffix);
    if (/^\d*$/.test(inserted) && /^[\d.]*$/.test(next)) candidate = next.replace(/\./g, '');
  }
  const formatted = formatGhnIntegerInput(candidate);
  return { text: formatted, caret: formatted === next ? caret : ghnCaretAtDigit(formatted, ghnDigitOffset(next, caret)) };
}

/** Pasting a malformed number must remain visibly invalid, never become another amount. */
export function pasteGhnIntegerInput(previous: string, pasted: string, start: number, end: number) {
  const digits = previous === '' ? '' : ghnIntegerDigits(previous), inserted = ghnIntegerDigits(pasted);
  if (digits === null || inserted === null) {
    const text = previous.slice(0, start) + pasted + previous.slice(end);
    const formatted = formatGhnIntegerInput(text), caret = start + pasted.length;
    return { text: formatted, caret: formatted === text ? caret : ghnCaretAtDigit(formatted, ghnDigitOffset(text, caret)) };
  }
  const from = ghnDigitOffset(previous, start), to = ghnDigitOffset(previous, end);
  const text = formatGhnIntegerInput(digits.slice(0, from) + inserted + digits.slice(to));
  return { text, caret: ghnCaretAtDigit(text, from + inserted.length) };
}

/** Delete the adjacent digit when the browser caret touches a grouping dot. */
export function deleteGhnIntegerSeparator(text: string, caret: number, key: string) {
  const digits = ghnIntegerDigits(text);
  if (digits === null || !((key === 'Backspace' && text[caret - 1] === '.') || (key === 'Delete' && text[caret] === '.'))) return null;
  const at = ghnDigitOffset(text, caret) - (key === 'Backspace' ? 1 : 0);
  const next = formatGhnIntegerInput(digits.slice(0, at) + digits.slice(at + 1));
  return { text: next, caret: ghnCaretAtDigit(next, at) };
}
