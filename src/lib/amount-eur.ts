/**
 * Parse a monetary amount entered in euros, without interpreting invalid
 * separators or scientific notation. The database stores NUMERIC(14, 2).
 */
export function parseEurAmount(input: string): number | null {
  const value = input.trim();
  if (!/^\d{1,12}(?:[.,]\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) return null;
  return cents / 100;
}

export function parsePositiveEurThreshold(input: string): number | null {
  const amount = parseEurAmount(input);
  return amount !== null && amount > 0 ? amount : null;
}
