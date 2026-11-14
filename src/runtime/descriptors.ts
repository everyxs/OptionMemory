const ELEMENT_RE = /([A-Z][a-z]?)([0-9]+(?:\.[0-9]+)?)/g;

export function calculateSmix(composition: string): number {
  let cursor = 0;
  let total = 0;
  const values: number[] = [];
  for (const match of composition.matchAll(ELEMENT_RE)) {
    if (match.index !== cursor) throw new Error(`invalid composition: ${composition}`);
    cursor = match.index + match[0].length;
    const value = Number(match[2]);
    if (!(value > 0)) throw new Error(`invalid element fraction: ${match[0]}`);
    values.push(value);
    total += value;
  }
  const isAtomicFraction = Math.abs(total - 1) <= 1e-6;
  const isAtomicPercent = Math.abs(total - 100) <= 1e-6;
  if (cursor !== composition.length || values.length === 0 || (!isAtomicFraction && !isAtomicPercent)) {
    throw new Error(`composition must sum to 1 or 100 at.%: ${composition}`);
  }
  const sum = values.reduce((acc, value) => {
    const x = value / total;
    return acc + x * Math.log(x);
  }, 0);
  return -8.314 * sum;
}
