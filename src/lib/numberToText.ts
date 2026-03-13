/**
 * Convert a number to Vietnamese text representation.
 * e.g., 82944000 → "Tám mươi hai triệu chín trăm bốn mươi tư nghìn"
 */

const ones = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const groupNames = ['', 'nghìn', 'triệu', 'tỷ'];

function readGroup(hundreds: number, tens: number, units: number, showZeroHundred: boolean): string {
  let result = '';

  if (hundreds > 0) {
    result += ones[hundreds] + ' trăm';
    if (tens === 0 && units > 0) {
      result += ' lẻ';
    }
  } else if (showZeroHundred) {
    result += 'không trăm';
    if (tens === 0 && units > 0) {
      result += ' lẻ';
    }
  }

  if (tens > 1) {
    result += ' ' + ones[tens] + ' mươi';
    if (units === 1) {
      result += ' mốt';
    } else if (units === 4 && tens >= 2) {
      result += ' tư';
    } else if (units === 5) {
      result += ' lăm';
    } else if (units > 0) {
      result += ' ' + ones[units];
    }
  } else if (tens === 1) {
    result += ' mười';
    if (units === 5) {
      result += ' lăm';
    } else if (units > 0) {
      result += ' ' + ones[units];
    }
  } else if (units > 0) {
    result += ' ' + ones[units];
  }

  return result.trim();
}

export function numberToVietnameseText(num: number): string {
  if (num === 0) return 'không';
  if (!num || isNaN(num)) return '';

  num = Math.round(Math.abs(num));

  const numStr = num.toString();
  // Pad to multiple of 3
  const padded = numStr.padStart(Math.ceil(numStr.length / 3) * 3, '0');

  const groups: number[][] = [];
  for (let i = 0; i < padded.length; i += 3) {
    groups.push([
      parseInt(padded[i]),
      parseInt(padded[i + 1]),
      parseInt(padded[i + 2]),
    ]);
  }

  const totalGroups = groups.length;
  const parts: string[] = [];

  for (let i = 0; i < totalGroups; i++) {
    const [h, t, u] = groups[i];
    const groupIndex = totalGroups - 1 - i;
    const showZeroHundred = i > 0 && (h === 0 && (t > 0 || u > 0));

    if (h === 0 && t === 0 && u === 0) continue;

    const text = readGroup(h, t, u, showZeroHundred);
    if (text) {
      parts.push(text + (groupNames[groupIndex] ? ' ' + groupNames[groupIndex] : ''));
    }
  }

  let result = parts.join(' ');
  // Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1);

  return result;
}

/**
 * Format number to Vietnamese text with "đồng" suffix.
 * e.g., 82944000 → "Tám mươi hai triệu chín trăm bốn mươi tư nghìn đồng"
 */
export function numberToVietnameseCurrency(num: number): string {
  if (!num || num === 0) return 'Không đồng';
  return numberToVietnameseText(num) + ' đồng';
}
