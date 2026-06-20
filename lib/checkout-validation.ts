export function parseOptionalText(
  value: unknown,
  maxLength: number,
  label: string
): { value: string | null; error?: string } {
  const text = String(value || "").trim();
  if (text.length > maxLength) {
    return { value: null, error: `${label} не должен превышать ${maxLength} символов` };
  }

  return { value: text || null };
}
