export function normalizeInputValue(
  draft: string,
  fallback: number,
  min?: number,
  max?: number,
  integer = false,
) {
  const value = Number(draft);
  if (
    draft.trim() === "" ||
    !Number.isFinite(value) ||
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  )
    return fallback;
  return integer ? Math.round(value) : value;
}

export function liveInputValue(
  draft: string,
  min?: number,
  max?: number,
  integer = false,
) {
  if (draft.trim() === "" || /[eE.+-]$/.test(draft)) return null;
  const value = Number(draft);
  if (
    !Number.isFinite(value) ||
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  )
    return null;
  return integer ? Math.round(value) : value;
}
