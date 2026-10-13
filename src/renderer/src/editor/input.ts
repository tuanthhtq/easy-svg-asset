export type EditorShortcut =
  "copy" | "delete" | "duplicate" | "paste" | "redo" | "undo";

export type ViewportTransform = [
  number,
  number,
  number,
  number,
  number,
  number,
];

export function editorShortcut(
  key: string,
  modifier: boolean,
  shift: boolean,
): EditorShortcut | null {
  const normalized = key.toLowerCase();
  if (!modifier && (normalized === "backspace" || normalized === "delete"))
    return "delete";
  if (!modifier) return null;
  if (normalized === "z") return shift ? "redo" : "undo";
  if (normalized === "y") return "redo";
  if (normalized === "c") return "copy";
  if (normalized === "v") return "paste";
  if (normalized === "d") return "duplicate";
  return null;
}

export function snapValue(value: number, enabled: boolean, size: number) {
  return enabled ? Math.round(value / size) * size : value;
}

export function resizeAxes(corner?: string) {
  return {
    width: corner !== "mt" && corner !== "mb",
    height: corner !== "ml" && corner !== "mr",
  };
}

export function clampZoom(value: number) {
  return Math.min(8, Math.max(0.1, value));
}

export function wheelZoom(current: number, delta: number) {
  return clampZoom(current * Math.pow(0.999, delta));
}

export function panViewport(
  transform: ViewportTransform,
  deltaX: number,
  deltaY: number,
): ViewportTransform {
  const [a, b, c, d, x, y] = transform;
  return [a, b, c, d, x + deltaX, y + deltaY];
}

export function focusViewport(
  transform: ViewportTransform,
  point: { x: number; y: number },
  width: number,
  height: number,
): ViewportTransform {
  const [a, b, c, d] = transform;
  return [
    a,
    b,
    c,
    d,
    width / 2 - (a * point.x + c * point.y),
    height / 2 - (b * point.x + d * point.y),
  ];
}
