export type AiPoint = { x: number; y: number };
export type AiBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type AiShapeKind = "rect" | "ellipse" | "triangle" | "pen";

export type AiShapeSpec = {
  type: AiShapeKind;
  name: string;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  rotation: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  radius: number;
  points: AiPoint[] | null;
};

export type AiCommand =
  | { kind: "create_shape"; shape: AiShapeSpec }
  | { kind: "create_asset"; groupName: string; children: AiShapeSpec[] }
  | {
      kind: "generate_palette";
      mode: "create" | "update";
      paletteName: string;
      targetPaletteId: string | null;
      colors: string[];
    }
  | {
      kind: "recolor_objects";
      paletteId: string;
      paletteSuggestions: string[];
      changes: Array<{
        objectId: string;
        fill: string | null;
        stroke: string | null;
      }>;
    };

export type AiSceneObject = {
  id: string;
  type: string;
  name: string;
  bounds: AiBounds;
  rotation: number;
  zIndex: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  radius: number | null;
};

export type AiPalette = { id: string; name: string; colors: string[] };
export type AiSceneContext = {
  canvas: { width: number; height: number };
  objects: AiSceneObject[];
  selectedObjectIds: string[];
  activePalette: AiPalette;
  settings: {
    strokeWidth: number;
    radius: number;
    snapToGrid: boolean;
    gridSize: number;
  };
  sceneVersion: number;
};
export type AiImage = { mimeType: string; data: string };
export type AiRequest = {
  prompt: string;
  image: AiImage | null;
  scene: AiSceneContext;
};
export type AiResponse = {
  message: string;
  commands: AiCommand[];
  sceneVersion: number;
};

export function compactAiScene(scene: AiSceneContext) {
  return {
    c: [scene.canvas.width, scene.canvas.height],
    o: scene.objects.map((object) => [
      object.id,
      object.type,
      object.name,
      object.bounds.left,
      object.bounds.top,
      object.bounds.width,
      object.bounds.height,
      object.rotation,
      object.zIndex,
      object.strokeWidth,
      object.radius,
    ]),
    s: scene.selectedObjectIds,
    p: scene.activePalette.colors,
    d: [
      scene.settings.strokeWidth,
      scene.settings.radius,
      scene.settings.snapToGrid,
      scene.settings.gridSize,
    ],
    v: scene.sceneVersion,
  };
}

const HEX_COLOR = /^#[\da-f]{6}$/i;
const SHAPE_TYPES = new Set<AiShapeKind>([
  "rect",
  "ellipse",
  "triangle",
  "pen",
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AI returned invalid command data");
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 80) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`AI returned invalid ${label}`);
  return value.trim();
}

function finite(value: unknown, label: string, min = -Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min)
    throw new Error(`AI returned invalid ${label}`);
  return value;
}

function nullableFinite(value: unknown, label: string, min = -Infinity) {
  return value === null ? null : finite(value, label, min);
}

function color(value: unknown, label: string) {
  if (value !== null && (typeof value !== "string" || !HEX_COLOR.test(value)))
    throw new Error(`AI returned invalid ${label}`);
  return value as string | null;
}

function colors(value: unknown, label: string) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 16 ||
    !value.every((item) => typeof item === "string" && HEX_COLOR.test(item))
  )
    throw new Error(`AI returned invalid ${label}`);
  return [...new Set(value.map((item) => item.toLowerCase()))];
}

export function parseAiShape(value: unknown): AiShapeSpec {
  const item = record(value);
  if (
    typeof item.type !== "string" ||
    !SHAPE_TYPES.has(item.type as AiShapeKind)
  )
    throw new Error("AI returned an unsupported shape");
  const points =
    item.points === null
      ? null
      : Array.isArray(item.points)
        ? item.points.map((point) => {
            const next = record(point);
            return {
              x: finite(next.x, "point x"),
              y: finite(next.y, "point y"),
            };
          })
        : null;
  if (
    item.type === "pen" &&
    (!points || points.length < 3 || points.length > 64)
  )
    throw new Error("AI pen shapes need 3 to 64 points");
  if (
    item.type !== "pen" &&
    (item.x === null ||
      item.y === null ||
      item.width === null ||
      item.height === null)
  )
    throw new Error("AI primitive shape is missing bounds");
  return {
    type: item.type as AiShapeKind,
    name: text(item.name, "shape name"),
    x: nullableFinite(item.x, "shape x"),
    y: nullableFinite(item.y, "shape y"),
    width: nullableFinite(item.width, "shape width", 1),
    height: nullableFinite(item.height, "shape height", 1),
    rotation: finite(item.rotation, "shape rotation"),
    fill: color(item.fill, "shape fill"),
    stroke: color(item.stroke, "shape stroke"),
    strokeWidth: finite(item.strokeWidth, "shape stroke width", 0),
    radius: finite(item.radius, "shape radius", 0),
    points,
  };
}

export function parseAiCommand(
  name: string,
  value: unknown,
): AiCommand | string {
  const item = record(value);
  if (name === "create_shape")
    return { kind: "create_shape", shape: parseAiShape(item.shape) };
  if (name === "create_asset") {
    if (
      !Array.isArray(item.children) ||
      item.children.length < 2 ||
      item.children.length > 8
    )
      throw new Error("AI asset needs 2 to 8 shapes");
    return {
      kind: "create_asset",
      groupName: text(item.groupName, "group name"),
      children: item.children.map(parseAiShape),
    };
  }
  if (name === "generate_palette") {
    if (item.mode !== "create" && item.mode !== "update")
      throw new Error("AI returned invalid palette mode");
    const targetPaletteId =
      item.targetPaletteId === null
        ? null
        : text(item.targetPaletteId, "target palette ID");
    if (item.mode === "update" && !targetPaletteId)
      throw new Error("AI palette update needs a target");
    return {
      kind: "generate_palette",
      mode: item.mode,
      paletteName: text(item.paletteName, "palette name", 40),
      targetPaletteId,
      colors: colors(item.colors, "palette colors"),
    };
  }
  if (name === "recolor_objects") {
    if (
      !Array.isArray(item.changes) ||
      !item.changes.length ||
      item.changes.length > 200
    )
      throw new Error("AI recolor needs 1 to 200 changes");
    const suggestions = Array.isArray(item.paletteSuggestions)
      ? item.paletteSuggestions
      : [];
    if (
      suggestions.length > 16 ||
      !suggestions.every(
        (value) => typeof value === "string" && HEX_COLOR.test(value),
      )
    )
      throw new Error("AI returned invalid palette suggestions");
    return {
      kind: "recolor_objects",
      paletteId: text(item.paletteId, "palette ID"),
      paletteSuggestions: [
        ...new Set(suggestions.map((value) => value.toLowerCase())),
      ],
      changes: item.changes.map((change) => {
        const next = record(change);
        return {
          objectId: text(next.objectId, "object ID"),
          fill: color(next.fill, "object fill"),
          stroke: color(next.stroke, "object stroke"),
        };
      }),
    };
  }
  if (name === "request_clarification")
    return text(item.question, "clarification question", 300);
  throw new Error("AI returned an unknown tool call");
}

export function shapeBounds(shape: AiShapeSpec): AiBounds {
  const base =
    shape.type !== "pen"
      ? {
          left: shape.x!,
          top: shape.y!,
          width: shape.width!,
          height: shape.height!,
        }
      : (() => {
          const xs = shape.points!.map((point) => point.x);
          const ys = shape.points!.map((point) => point.y);
          const left = Math.min(...xs);
          const top = Math.min(...ys);
          return {
            left,
            top,
            width: Math.max(...xs) - left,
            height: Math.max(...ys) - top,
          };
        })();
  const padding = shape.stroke ? shape.strokeWidth / 2 : 0;
  const padded = {
    left: base.left - padding,
    top: base.top - padding,
    width: base.width + padding * 2,
    height: base.height + padding * 2,
  };
  const radians = (shape.rotation * Math.PI) / 180;
  const width =
    Math.abs(padded.width * Math.cos(radians)) +
    Math.abs(padded.height * Math.sin(radians));
  const height =
    Math.abs(padded.width * Math.sin(radians)) +
    Math.abs(padded.height * Math.cos(radians));
  return {
    left: padded.left + (padded.width - width) / 2,
    top: padded.top + (padded.height - height) / 2,
    width,
    height,
  };
}

function unionBounds(bounds: AiBounds[]): AiBounds {
  const left = Math.min(...bounds.map((item) => item.left));
  const top = Math.min(...bounds.map((item) => item.top));
  const right = Math.max(...bounds.map((item) => item.left + item.width));
  const bottom = Math.max(...bounds.map((item) => item.top + item.height));
  return { left, top, width: right - left, height: bottom - top };
}

function overlaps(a: AiBounds, b: AiBounds) {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

export function validateAiPlan(
  commands: AiCommand[],
  scene: AiSceneContext,
  palettes: AiPalette[],
) {
  const occupied = scene.objects.map((object) => object.bounds);
  const objectIds = new Set(scene.objects.map((object) => object.id));
  const activeColors = new Set(
    scene.activePalette.colors.map((color) => color.toLowerCase()),
  );
  const paletteMap = new Map(
    palettes.map((palette) => [
      palette.id,
      new Set(palette.colors.map((color) => color.toLowerCase())),
    ]),
  );
  for (const command of commands) {
    if (command.kind === "create_shape" || command.kind === "create_asset") {
      const shapes =
        command.kind === "create_shape" ? [command.shape] : command.children;
      for (const shape of shapes) {
        for (const paint of [shape.fill, shape.stroke])
          if (paint !== null && !activeColors.has(paint.toLowerCase()))
            throw new Error("AI created a shape outside the active palette");
        if (
          shape.stroke !== null &&
          shape.strokeWidth !== scene.settings.strokeWidth
        )
          throw new Error("AI created a shape with inconsistent stroke width");
        const radius =
          shape.type === "rect"
            ? Math.min(
                scene.settings.radius,
                shape.width! / 2,
                shape.height! / 2,
              )
            : 0;
        if (Math.abs(shape.radius - radius) > 1e-6)
          throw new Error("AI created a shape with inconsistent corner radius");
      }
      const bounds =
        command.kind === "create_shape"
          ? shapeBounds(command.shape)
          : unionBounds(command.children.map(shapeBounds));
      if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        bounds.left < 0 ||
        bounds.top < 0 ||
        bounds.left + bounds.width > scene.canvas.width ||
        bounds.top + bounds.height > scene.canvas.height
      )
        throw new Error("AI placed a shape outside the canvas");
      if (occupied.some((item) => overlaps(item, bounds)))
        throw new Error("AI placed a shape over an existing object");
      occupied.push(bounds);
    }
    if (command.kind === "generate_palette") {
      if (command.mode === "create" && palettes.length >= 32)
        throw new Error("Palette limit reached");
      if (
        command.mode === "update" &&
        !palettes.some((palette) => palette.id === command.targetPaletteId)
      )
        throw new Error("AI targeted a missing palette");
    }
    if (command.kind === "recolor_objects") {
      const allowed = paletteMap.get(command.paletteId);
      if (!allowed) throw new Error("AI targeted a missing palette");
      if (new Set([...allowed, ...command.paletteSuggestions]).size > 16)
        throw new Error("AI palette suggestions exceed the palette limit");
      const permitted = new Set([...allowed, ...command.paletteSuggestions]);
      for (const change of command.changes) {
        if (!objectIds.has(change.objectId))
          throw new Error("AI targeted a missing object");
        for (const value of [change.fill, change.stroke])
          if (value !== null && !permitted.has(value.toLowerCase()))
            throw new Error("AI recolor used a color outside the palette");
      }
    }
  }
}
