import { Control, Point, Rect, util } from "fabric";

const HANDLE_INSET = 14;
const radiusGridSizes = new WeakMap<Rect, number>();
const radiusChangeHandlers = new WeakMap<Rect, () => void>();

export function clampRadius(value: number, width: number, height: number) {
  return Math.min(Math.max(value, 0), width / 2, height / 2);
}

export function visualRadius(rect: Rect) {
  const value = rect.rx * Math.abs(rect.scaleX || 1);
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-6 ? rounded : value;
}

export function setVisualRadius(rect: Rect, value: number) {
  const scaleX = Math.abs(rect.scaleX || 1);
  const scaleY = Math.abs(rect.scaleY || 1);
  rect.set({
    rx: value / scaleX,
    ry: value / scaleY,
  });
}

export function maxVisualRadius(rect: Rect) {
  return Math.min(
    (rect.width * Math.abs(rect.scaleX || 1)) / 2,
    (rect.height * Math.abs(rect.scaleY || 1)) / 2,
  );
}

export function snapRadius(value: number, gridSize: number) {
  return gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;
}

const radiusControl = new Control({
  actionName: "resizing",
  cursorStyle: "ew-resize",
  sizeX: 10,
  sizeY: 10,
  positionHandler(dim, matrix, object) {
    const rect = object as Rect;
    const radius = clampRadius(visualRadius(rect), dim.x, dim.y);
    return new Point(-dim.x / 2 + radius, -dim.y / 2 + HANDLE_INSET).transform(
      matrix,
    );
  },
  actionHandler(_event, { target }, x, y) {
    if (!(target instanceof Rect)) return false;
    const local = new Point(x, y).transform(
      util.invertTransform(target.calcTransformMatrix()),
    );
    const radius = clampRadius(
      snapRadius(
        (local.x + target.width / 2) * Math.abs(target.scaleX || 1),
        radiusGridSizes.get(target) ?? 0,
      ),
      target.width * Math.abs(target.scaleX || 1),
      target.height * Math.abs(target.scaleY || 1),
    );
    if (radius === visualRadius(target)) return false;
    setVisualRadius(target, radius);
    radiusChangeHandlers.get(target)?.();
    return true;
  },
  render(context, left, top) {
    context.save();
    context.translate(left, top);
    context.beginPath();
    context.arc(0, 0, 5, 0, Math.PI * 2);
    context.fillStyle = "#ffb454";
    context.fill();
    context.strokeStyle = "#17191f";
    context.stroke();
    context.restore();
  },
});

export function enableRadiusControl(
  rect: Rect,
  gridSize = 0,
  onChange?: () => void,
) {
  radiusGridSizes.set(rect, gridSize);
  if (onChange) radiusChangeHandlers.set(rect, onChange);
  rect.controls = { ...rect.controls, radius: radiusControl };
  return rect;
}
