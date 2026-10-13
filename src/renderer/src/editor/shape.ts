export type ShapeTool = "rect" | "ellipse" | "triangle";

export type ShapePoint = { x: number; y: number };
export type ShapeBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function shapeBounds(start: ShapePoint, end: ShapePoint) {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function squareBounds(bounds: ShapeBounds[]) {
  if (!bounds.length) return null;
  const left = Math.floor(Math.min(...bounds.map((box) => box.left)));
  const top = Math.floor(Math.min(...bounds.map((box) => box.top)));
  const right = Math.ceil(
    Math.max(...bounds.map((box) => box.left + box.width)),
  );
  const bottom = Math.ceil(
    Math.max(...bounds.map((box) => box.top + box.height)),
  );
  const width = right - left;
  const height = bottom - top;
  const size = Math.max(1, width, height);
  return {
    left: left - (size - width) / 2,
    top: top - (size - height) / 2,
    width: size,
    height: size,
  };
}

export function canClosePen(
  points: ShapePoint[],
  point: ShapePoint,
  threshold: number,
) {
  const first = points[0];
  return (
    points.length >= 3 &&
    Boolean(first) &&
    Math.hypot(point.x - first.x, point.y - first.y) <= threshold
  );
}
