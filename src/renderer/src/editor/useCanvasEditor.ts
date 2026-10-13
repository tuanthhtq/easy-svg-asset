import { useEffect, useRef, useState } from "react";
import {
  ActiveSelection,
  Canvas,
  Circle,
  Ellipse,
  FabricObject,
  Group,
  Polygon,
  Polyline,
  Point,
  Rect,
  Triangle,
  loadSVGFromString,
  type TPointerEventInfo,
} from "fabric";
import type { Project } from "../../../shared/types";
import { isFlattened, markFlattened, restoreFlattened } from "./flatten";
import { History } from "./history";
import {
  clampZoom,
  editorShortcut,
  focusViewport,
  panViewport,
  snapValue,
  wheelZoom,
  type ViewportTransform,
} from "./input";
import {
  clampRadius,
  enableRadiusControl,
  maxVisualRadius,
  setVisualRadius,
  visualRadius,
} from "./roundedRect";
import {
  canClosePen,
  shapeBounds,
  squareBounds,
  type ShapeBounds,
  type ShapePoint,
  type ShapeTool,
} from "./shape";

export type Tool = "select" | "pen" | ShapeTool;
export type LayerAction = "up" | "down" | "front" | "back";
export type ContextMenu = { x: number; y: number } | null;

const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_CANVAS_HEIGHT = 760;
const CANVAS_BACKGROUND = "#fbfaf7";
const PREVIEW_STROKE = "#ffb454";

export function useCanvasEditor(project: Project | null) {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const toolRef = useRef<Tool>("select");
  const history = useRef(new History());
  const restoring = useRef(false);
  const clipboard = useRef<FabricObject | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<FabricObject | null>(null);
  const [fill, setFill] = useState<string | null>("#ff6b4a");
  const [stroke, setStroke] = useState<string | null>("#17191f");
  const [radius, setRadius] = useState(16);
  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(2);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [changeVersion, setChangeVersion] = useState(0);
  const [, render] = useState(0);
  const fillRef = useRef(fill);
  const strokeRef = useRef(stroke);
  const canvasWidthRef = useRef(DEFAULT_CANVAS_WIDTH);
  const canvasHeightRef = useRef(DEFAULT_CANVAS_HEIGHT);
  const snapToGridRef = useRef(snapToGrid);
  const gridSizeRef = useRef(gridSize);
  const spacePressed = useRef(false);
  const panning = useRef(false);
  const panOrigin = useRef<{
    x: number;
    y: number;
    transform: ViewportTransform;
  }>({ x: 0, y: 0, transform: [1, 0, 0, 1, 0, 0] });
  const shapeDraft = useRef<{
    kind: ShapeTool;
    start: ShapePoint;
    object?: FabricObject;
  } | null>(null);
  const penDraft = useRef<{
    points: ShapePoint[];
    preview?: Polyline;
    anchors: Circle[];
  }>({ points: [], anchors: [] });
  const transformRadius = useRef(new WeakMap<Rect, number>());

  fillRef.current = fill;
  strokeRef.current = stroke;
  snapToGridRef.current = snapToGrid;
  gridSizeRef.current = gridSize;

  useEffect(() => {
    if (!project) return;
    setSnapToGrid(project.snapToGrid);
    setGridSize(project.gridSize);
  }, [project]);

  function snapGridSize() {
    return snapToGridRef.current ? gridSizeRef.current : 0;
  }

  useEffect(() => {
    toolRef.current = tool;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (tool !== "pen" && penDraft.current.points.length) clearPenDraft();
    if (tool === "pen" && penDraft.current.points.length) redrawPenDraft();
    canvas
      .getObjects()
      .forEach((object) =>
        prepareObject(object, snapGridSize(), refreshSelection),
      );
    const selecting = tool === "select";
    canvas.isDrawingMode = false;
    canvas.skipTargetFind = !selecting;
    canvas.selection = selecting;
    canvas.defaultCursor = selecting ? "default" : "crosshair";
    canvas.hoverCursor = selecting ? "move" : "crosshair";
    canvas.requestRenderAll();
  }, [tool, stroke, snapToGrid, gridSize]);

  function snapshot() {
    const canvas = canvasRef.current;
    return canvas ? JSON.stringify(canvas.toJSON()) : "";
  }

  function commit() {
    if (restoring.current) return;
    history.current.push(snapshot());
    setChangeVersion((value) => value + 1);
    render((value) => value + 1);
  }

  async function restore(value: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    restoring.current = true;
    await canvas.loadFromJSON(value);
    canvas
      .getObjects()
      .forEach((object) =>
        prepareObject(object, snapGridSize(), refreshSelection),
      );
    canvas.requestRenderAll();
    restoring.current = false;
    setSelected(null);
    setChangeVersion((count) => count + 1);
    render((count) => count + 1);
  }

  function refreshSelection() {
    const object = canvasRef.current?.getActiveObject() ?? null;
    setSelected(object);
    if (typeof object?.fill === "string" || object?.fill === null)
      setFill(object.fill);
    if (typeof object?.stroke === "string" || object?.stroke === null)
      setStroke(object.stroke);
    if (object instanceof Rect) setRadius(visualRadius(object));
    render((count) => count + 1);
  }

  useEffect(() => {
    if (!project || !canvasEl.current) return;
    const canvas = new Canvas(canvasEl.current, {
      width: 1,
      height: 1,
      preserveObjectStacking: true,
      uniformScaling: false,
    });
    canvas.skipTargetFind = toolRef.current !== "select";
    canvas.selection = toolRef.current === "select";
    canvas.isDrawingMode = false;
    canvas.defaultCursor =
      toolRef.current === "select" ? "default" : "crosshair";
    canvas.hoverCursor = canvas.defaultCursor;
    canvasRef.current = canvas;
    const resizeCanvas = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const width = Math.max(1, Math.floor(stage.clientWidth));
      const height = Math.max(1, Math.floor(stage.clientHeight));
      const hadSize = canvas.getWidth() > 1 || canvas.getHeight() > 1;
      canvas.setDimensions({ width, height });
      if (!hadSize) {
        canvas.setViewportTransform([
          1,
          0,
          0,
          1,
          width / 2 - canvasWidthRef.current / 2,
          height / 2 - canvasHeightRef.current / 2,
        ]);
      }
      canvas.requestRenderAll();
    };
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    resizeCanvas();
    const drawCanvas = ({ ctx }: { ctx: CanvasRenderingContext2D }) => {
      ctx.save();
      if (snapToGridRef.current) {
        const [scaleX, skewY, skewX, scaleY, translateX, translateY] =
          canvas.viewportTransform;
        if (!scaleX || !scaleY) {
          ctx.restore();
          return;
        }
        ctx.transform(scaleX, skewY, skewX, scaleY, translateX, translateY);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(236, 234, 229, 0.14)";
        ctx.lineWidth = 1 / Math.max(scaleX, scaleY);
        const left = -translateX / scaleX - gridSizeRef.current;
        const top = -translateY / scaleY - gridSizeRef.current;
        const right = (canvas.getWidth() - translateX) / scaleX;
        const bottom = (canvas.getHeight() - translateY) / scaleY;
        for (
          let x = Math.floor(left / gridSizeRef.current) * gridSizeRef.current;
          x <= right;
          x += gridSizeRef.current
        ) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
        }
        for (
          let y = Math.floor(top / gridSizeRef.current) * gridSizeRef.current;
          y <= bottom;
          y += gridSizeRef.current
        ) {
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };
    canvas.backgroundColor = "";
    canvas.on("before:render", drawCanvas);
    const changed = () => {
      if (restoring.current) return;
      commit();
      refreshSelection();
    };
    canvas.on("object:added", changed);
    canvas.on("before:transform", ({ transform }) => {
      if (transform.target instanceof Rect)
        transformRadius.current.set(
          transform.target,
          visualRadius(transform.target),
        );
    });
    canvas.on("object:modified", ({ target }) => {
      normalizeObject(target, snapGridSize());
      if (target instanceof Rect) transformRadius.current.delete(target);
      changed();
    });
    canvas.on("object:scaling", ({ target, transform }) => {
      if (snapToGridRef.current) {
        const anchor = target.getPositionByOrigin(
          transform.originX,
          transform.originY,
        );
        const width = snapValue(
          target.getScaledWidth(),
          true,
          gridSizeRef.current,
        );
        const height = snapValue(
          target.getScaledHeight(),
          true,
          gridSizeRef.current,
        );
        if (target.width) target.set("scaleX", width / target.width);
        if (target.height) target.set("scaleY", height / target.height);
        target.setPositionByOrigin(
          anchor,
          transform.originX,
          transform.originY,
        );
        target.setCoords();
      }
      if (target instanceof Rect) {
        const radius =
          transformRadius.current.get(target) ?? visualRadius(target);
        setVisualRadius(target, Math.min(radius, maxVisualRadius(target)));
      }
      refreshSelection();
    });
    canvas.on("object:removed", changed);
    canvas.on("selection:created", refreshSelection);
    canvas.on("selection:updated", refreshSelection);
    canvas.on("selection:cleared", refreshSelection);
    canvas.on("object:moving", ({ target }) => {
      if (snapToGridRef.current) {
        target.set({
          left: snapValue(target.left, true, gridSizeRef.current),
          top: snapValue(target.top, true, gridSizeRef.current),
        });
        target.setCoords();
      }
      refreshSelection();
    });
    const handlePointerDown = ({ e, scenePoint }: TPointerEventInfo) => {
      const kind = toolRef.current;
      setContextMenu(null);
      const button = "button" in e ? e.button : 0;
      if (button === 1 || (button === 0 && spacePressed.current)) {
        const event = e as MouseEvent;
        event.preventDefault();
        panning.current = true;
        panOrigin.current = {
          x: event.clientX,
          y: event.clientY,
          transform: [...canvas.viewportTransform] as ViewportTransform,
        };
        canvas.selection = false;
        canvas.defaultCursor = "grabbing";
        canvas.hoverCursor = "grabbing";
        return;
      }
      if ("button" in e && e.button === 2) {
        const target = canvas.findTarget(e).target;
        if (target) {
          if (!canvas.getActiveObjects().includes(target))
            canvas.setActiveObject(target);
          refreshSelection();
          setContextMenu({
            x: Math.max(
              0,
              Math.min("clientX" in e ? e.clientX : 0, window.innerWidth - 170),
            ),
            y: Math.max(
              0,
              Math.min(
                "clientY" in e ? e.clientY : 0,
                window.innerHeight - 250,
              ),
            ),
          });
        }
        return;
      }
      if (button !== 0) return;
      const point = snapPointToGrid(scenePoint);
      if (kind === "select") return;
      if (kind === "pen") {
        addPenPoint(point);
        return;
      }
      shapeDraft.current = { kind, start: point };
    };
    const handlePointerMove = ({ e, scenePoint }: TPointerEventInfo) => {
      if (panning.current) {
        const event = e as MouseEvent;
        canvas.setViewportTransform(
          panViewport(
            panOrigin.current.transform,
            event.clientX - panOrigin.current.x,
            event.clientY - panOrigin.current.y,
          ),
        );
        canvas.requestRenderAll();
        return;
      }
      const point = snapPointToGrid(scenePoint);
      const draft = shapeDraft.current;
      if (!draft) {
        if (toolRef.current === "pen" && penDraft.current.points.length)
          updatePenPreview(point);
        return;
      }
      const bounds = shapeBounds(draft.start, point);
      if (!draft.object && (bounds.width > 2 || bounds.height > 2)) {
        draft.object = prepareObject(
          createShape(draft.kind, bounds),
          snapGridSize(),
          refreshSelection,
        );
        draft.object.set({ evented: false, selectable: false });
        restoring.current = true;
        canvas.add(draft.object);
        restoring.current = false;
      }
      if (draft.object) {
        updateShape(draft.object, draft.kind, bounds);
        canvas.requestRenderAll();
      }
    };
    const handlePointerUp = () => {
      if (panning.current) {
        panning.current = false;
        canvas.selection = toolRef.current === "select";
        canvas.defaultCursor =
          toolRef.current === "select" ? "default" : "crosshair";
        canvas.hoverCursor =
          toolRef.current === "select" ? "move" : "crosshair";
        return;
      }
      const draft = shapeDraft.current;
      shapeDraft.current = null;
      if (!draft?.object) return;
      draft.object.set({
        evented: true,
        selectable: true,
        fill: fillRef.current,
        stroke: strokeRef.current,
      });
      canvas.setActiveObject(draft.object);
      canvas.requestRenderAll();
      commit();
      refreshSelection();
      setTool("select");
    };
    canvas.on("mouse:down", handlePointerDown);
    canvas.on("mouse:move", handlePointerMove);
    canvas.on("mouse:up", handlePointerUp);
    const handleWheel = ({ e }: TPointerEventInfo) => {
      const event = e as WheelEvent;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const pointer = new Point(event.offsetX, event.offsetY);
        const value = wheelZoom(canvas.getZoom(), event.deltaY);
        canvas.zoomToPoint(pointer, value);
        setZoom(value);
      } else {
        canvas.setViewportTransform(
          panViewport(
            canvas.viewportTransform as ViewportTransform,
            -event.deltaX,
            -event.deltaY,
          ),
        );
      }
      canvas.requestRenderAll();
    };
    canvas.on("mouse:wheel", handleWheel);
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        spacePressed.current = true;
        canvas.defaultCursor = "grab";
        canvas.hoverCursor = "grab";
        return;
      }
      const action = editorShortcut(
        event.key,
        event.ctrlKey || event.metaKey,
        event.shiftKey,
      );
      if (!action) return;
      event.preventDefault();
      if (action === "undo") undo();
      else if (action === "redo") redo();
      else if (action === "delete") removeSelected();
      else if (action === "copy") void copySelected();
      else if (action === "paste") void pasteClipboard();
      else void duplicateSelected();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spacePressed.current = false;
      if (!panning.current)
        canvas.defaultCursor =
          toolRef.current === "select" ? "default" : "crosshair";
      if (!panning.current)
        canvas.hoverCursor =
          toolRef.current === "select" ? "move" : "crosshair";
    };
    const handleWindowBlur = () => {
      spacePressed.current = false;
      panning.current = false;
      canvas.selection = toolRef.current === "select";
      canvas.defaultCursor =
        toolRef.current === "select" ? "default" : "crosshair";
      canvas.hoverCursor = toolRef.current === "select" ? "move" : "crosshair";
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    history.current.reset(snapshot());

    return () => {
      canvas.off("mouse:down", handlePointerDown);
      canvas.off("mouse:move", handlePointerMove);
      canvas.off("mouse:up", handlePointerUp);
      canvas.off("mouse:wheel", handleWheel);
      canvas.off("before:render", drawCanvas);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      resizeObserver.disconnect();
      void canvas.dispose();
      canvasRef.current = null;
    };
  }, [project]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    restoring.current = true;
    canvas.clear();
    penDraft.current = { points: [], anchors: [] };
    shapeDraft.current = null;
    canvas.requestRenderAll();
    restoring.current = false;
    setSelected(null);
    setContextMenu(null);
    history.current.reset(snapshot());
    setDocumentSize(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
    render((count) => count + 1);
  }

  async function load(svg: string) {
    const parsed = await loadSVGFromString(svg, restoreFlattened);
    const canvas = canvasRef.current;
    if (!canvas) return;
    restoring.current = true;
    try {
      canvas.clear();
      penDraft.current = { points: [], anchors: [] };
      shapeDraft.current = null;
      canvas.add(
        ...parsed.objects
          .filter((item): item is FabricObject => Boolean(item))
          .map((object) =>
            prepareObject(object, snapGridSize(), refreshSelection),
          ),
      );
      canvas.requestRenderAll();
    } finally {
      restoring.current = false;
    }
    setDocumentSize(
      Number(parsed.options.width) || DEFAULT_CANVAS_WIDTH,
      Number(parsed.options.height) || DEFAULT_CANVAS_HEIGHT,
    );
    history.current.reset(snapshot());
    setSelected(null);
    render((count) => count + 1);
  }

  function createShape(
    kind: ShapeTool,
    bounds: ReturnType<typeof shapeBounds>,
  ) {
    const common = {
      ...bounds,
      originX: "left" as const,
      originY: "top" as const,
      fill: fillRef.current,
      stroke: strokeRef.current ?? PREVIEW_STROKE,
      strokeWidth: 2,
      strokeUniform: true,
    };
    return kind === "rect"
      ? new Rect({
          ...common,
          rx: 0,
          ry: 0,
        })
      : kind === "ellipse"
        ? new Ellipse({
            ...common,
            rx: bounds.width / 2,
            ry: bounds.height / 2,
          })
        : new Triangle(common);
  }

  function updateShape(
    object: FabricObject,
    kind: ShapeTool,
    bounds: ReturnType<typeof shapeBounds>,
  ) {
    if (kind === "ellipse" && object instanceof Ellipse)
      object.set({ ...bounds, rx: bounds.width / 2, ry: bounds.height / 2 });
    else object.set(bounds);
    object.setCoords();
  }

  function addPenPoint(point: ShapePoint) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draft = penDraft.current;
    if (canClosePen(draft.points, point, 12 / canvas.getZoom())) {
      finishPen();
      return;
    }
    draft.points.push(point);
    redrawPenDraft();
  }

  function redrawPenDraft() {
    const canvas = canvasRef.current;
    const draft = penDraft.current;
    if (!canvas) return;
    restoring.current = true;
    draft.anchors.forEach((anchor) => canvas.remove(anchor));
    draft.anchors = draft.points.map(
      (point) =>
        new Circle({
          left: point.x - 4,
          top: point.y - 4,
          radius: 4,
          fill: strokeRef.current ?? PREVIEW_STROKE,
          stroke: CANVAS_BACKGROUND,
          strokeWidth: 1,
          evented: false,
          excludeFromExport: true,
          originX: "left",
          originY: "top",
          selectable: false,
        }),
    );
    canvas.add(...draft.anchors);
    restoring.current = false;
    updatePenPreview();
  }

  function updatePenPreview(point?: ShapePoint) {
    const canvas = canvasRef.current;
    const draft = penDraft.current;
    if (!canvas || (!point && !draft.points.length)) return;
    const points = point ? [...draft.points, point] : draft.points;
    restoring.current = true;
    if (draft.preview) {
      draft.preview.set({
        points,
        stroke: strokeRef.current ?? PREVIEW_STROKE,
      });
      draft.preview.setBoundingBox(true);
      draft.preview.setCoords();
    } else {
      draft.preview = new Polyline(points, {
        fill: "",
        stroke: strokeRef.current ?? PREVIEW_STROKE,
        strokeWidth: 2,
        evented: false,
        excludeFromExport: true,
        selectable: false,
      });
      canvas.add(draft.preview);
    }
    restoring.current = false;
    canvas.requestRenderAll();
  }

  function clearPenDraft() {
    const canvas = canvasRef.current;
    const draft = penDraft.current;
    if (!canvas) return;
    restoring.current = true;
    if (draft.preview) canvas.remove(draft.preview);
    draft.anchors.forEach((anchor) => canvas.remove(anchor));
    restoring.current = false;
    penDraft.current = { points: [], anchors: [] };
    canvas.requestRenderAll();
  }

  function finishPen() {
    const canvas = canvasRef.current;
    const draft = penDraft.current;
    if (!canvas || draft.points.length < 3) return;
    const polygon = new Polygon(draft.points, {
      fill: fillRef.current,
      stroke: strokeRef.current,
      strokeWidth: 2,
      strokeUniform: true,
    });
    restoring.current = true;
    if (draft.preview) canvas.remove(draft.preview);
    draft.anchors.forEach((anchor) => canvas.remove(anchor));
    canvas.add(prepareObject(polygon, snapGridSize(), refreshSelection));
    restoring.current = false;
    penDraft.current = { points: [], anchors: [] };
    canvas.setActiveObject(polygon);
    canvas.requestRenderAll();
    commit();
    refreshSelection();
    setTool("select");
  }

  function updateStyle(
    key: "fill" | "stroke" | "rx",
    value: string | number | null,
  ) {
    const object = canvasRef.current?.getActiveObject();
    if (!object) return;
    const next =
      key === "rx" && object instanceof Rect
        ? Math.min(
            snapValue(
              Number(value),
              snapToGridRef.current,
              gridSizeRef.current,
            ),
            maxVisualRadius(object),
          )
        : value;
    if (key === "rx" && object instanceof Rect)
      setVisualRadius(object, Number(next));
    else object.set(key, next);
    if (key === "rx") {
      setRadius(Number(next));
    }
    object.setCoords();
    canvasRef.current?.requestRenderAll();
    commit();
    setSelected(object);
  }

  function updatePosition(key: "left" | "top", value: number) {
    const object = canvasRef.current?.getActiveObject();
    if (!object) return;
    object.set(
      key,
      snapValue(value, snapToGridRef.current, gridSizeRef.current),
    );
    object.setCoords();
    canvasRef.current?.requestRenderAll();
    commit();
    setSelected(object);
  }

  function snapPointToGrid(point: ShapePoint) {
    return {
      x: snapValue(point.x, snapToGridRef.current, gridSizeRef.current),
      y: snapValue(point.y, snapToGridRef.current, gridSizeRef.current),
    };
  }

  function removeSelected() {
    const canvas = canvasRef.current;
    const objects = canvas?.getActiveObjects() ?? [];
    if (!canvas || !objects.length) return;
    restoring.current = true;
    canvas.discardActiveObject();
    objects.forEach((object) => canvas.remove(object));
    restoring.current = false;
    commit();
    refreshSelection();
  }

  async function copySelected() {
    const object = canvasRef.current?.getActiveObject();
    if (object) clipboard.current = await object.clone();
  }

  async function pasteClipboard() {
    const canvas = canvasRef.current;
    if (!canvas || !clipboard.current) return;
    const clone = await clipboard.current.clone();
    clone.set({ left: clone.left + 16, top: clone.top + 16 });
    clipboard.current.set({
      left: clipboard.current.left + 16,
      top: clipboard.current.top + 16,
    });
    restoring.current = true;
    if (clone instanceof ActiveSelection) {
      clone.canvas = canvas;
      clone
        .getObjects()
        .forEach((object) =>
          canvas.add(prepareObject(object, snapGridSize(), refreshSelection)),
        );
      clone.setCoords();
    } else canvas.add(prepareObject(clone, snapGridSize(), refreshSelection));
    canvas.setActiveObject(clone);
    restoring.current = false;
    canvas.requestRenderAll();
    commit();
    refreshSelection();
  }

  async function duplicateSelected() {
    await copySelected();
    await pasteClipboard();
  }

  function rename(object: FabricObject, value?: string) {
    const named = object as FabricObject & { name?: string };
    const name = value ?? window.prompt("Layer name", named.name ?? "");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    named.name = trimmed;
    commit();
    render((count) => count + 1);
  }

  function setDocumentSize(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    const nextWidth = Math.min(4096, Math.max(64, Math.round(width)));
    const nextHeight = Math.min(4096, Math.max(64, Math.round(height)));
    canvasWidthRef.current = nextWidth;
    canvasHeightRef.current = nextHeight;
    canvasRef.current?.requestRenderAll();
  }

  async function addSvg(svg: string) {
    const parsed = await loadSVGFromString(svg, restoreFlattened);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objects = parsed.objects
      .filter((item): item is FabricObject => Boolean(item))
      .map((object) => prepareObject(object, snapGridSize(), refreshSelection));
    restoring.current = true;
    canvas.add(...objects);
    canvas.setActiveObject(
      objects.length === 1
        ? objects[0]
        : new ActiveSelection(objects, { canvas }),
    );
    restoring.current = false;
    canvas.requestRenderAll();
    commit();
    refreshSelection();
  }

  function selectionSvg() {
    const object = canvasRef.current?.getActiveObject();
    if (!object) return null;
    const box = object.getBoundingRect();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(box.width)}" height="${Math.ceil(box.height)}" viewBox="${box.left} ${box.top} ${box.width} ${box.height}">${object.toSVG()}</svg>`;
  }

  function toSvg(transparent = false, bounds?: ShapeBounds) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = bounds ?? {
      left: 0,
      top: 0,
      width: canvasWidthRef.current,
      height: canvasHeightRef.current,
    };
    const background = canvas.backgroundColor;
    canvas.backgroundColor = transparent ? "" : CANVAS_BACKGROUND;
    const svg = canvas.toSVG({
      suppressPreamble: true,
      width: String(box.width),
      height: String(box.height),
      viewBox: {
        x: box.left,
        y: box.top,
        width: box.width,
        height: box.height,
      },
    });
    canvas.backgroundColor = background;
    return svg;
  }

  function exportSvg() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = squareBounds(
      canvas
        .getObjects()
        .filter((object) => !object.excludeFromExport)
        .map((object) => object.getBoundingRect()),
    );
    return bounds ? toSvg(true, bounds) : null;
  }

  function select(object: FabricObject) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setActiveObject(object);
    canvas.setViewportTransform(
      focusViewport(
        canvas.viewportTransform as ViewportTransform,
        object.getCenterPoint(),
        canvas.getWidth(),
        canvas.getHeight(),
      ),
    );
    canvas.requestRenderAll();
    refreshSelection();
  }

  function undo() {
    const value = history.current.undo();
    if (value) void restore(value);
  }

  function redo() {
    const value = history.current.redo();
    if (value) void restore(value);
  }

  function group() {
    const canvas = canvasRef.current;
    const objects = canvas?.getActiveObjects() ?? [];
    if (!canvas || objects.length < 2) return;
    restoring.current = true;
    canvas.discardActiveObject();
    objects.forEach((object) => canvas.remove(object));
    const grouped = new Group(objects);
    canvas.add(grouped);
    canvas.setActiveObject(grouped);
    restoring.current = false;
    canvas.requestRenderAll();
    commit();
    refreshSelection();
  }

  function flatten() {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active || isFlattened(active)) return;
    if (active instanceof Group && !(active instanceof ActiveSelection)) {
      markFlattened(active);
      commit();
      refreshSelection();
      return;
    }
    const objects = canvas.getActiveObjects();
    if (objects.length < 2) return;
    restoring.current = true;
    canvas.discardActiveObject();
    objects.forEach((object) => canvas.remove(object));
    const flattened = markFlattened(new Group(objects));
    canvas.add(flattened);
    canvas.setActiveObject(flattened);
    restoring.current = false;
    canvas.requestRenderAll();
    commit();
    refreshSelection();
  }

  function ungroup() {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (
      !canvas ||
      !(object instanceof Group) ||
      object instanceof ActiveSelection ||
      isFlattened(object)
    )
      return;
    restoring.current = true;
    const items = object.removeAll();
    canvas.remove(object);
    canvas.add(...items);
    canvas.setActiveObject(new ActiveSelection(items, { canvas }));
    restoring.current = false;
    canvas.requestRenderAll();
    commit();
    refreshSelection();
  }

  function layer(action: LayerAction) {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object) return;
    if (action === "up") canvas.bringObjectForward(object);
    else if (action === "down") canvas.sendObjectBackwards(object);
    else if (action === "front") canvas.bringObjectToFront(object);
    else canvas.sendObjectToBack(object);
    canvas.requestRenderAll();
    commit();
    render((count) => count + 1);
  }

  function setCanvasZoom(next: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = clampZoom(next);
    canvas.zoomToPoint(
      new Point(canvas.getWidth() / 2, canvas.getHeight() / 2),
      value,
    );
    setZoom(value);
  }

  return {
    canvasEl,
    stageRef,
    tool,
    setTool,
    selected,
    fill,
    setFill,
    stroke,
    setStroke,
    radius,
    setRadius,
    zoom,
    canFlatten:
      selected instanceof ActiveSelection ||
      (selected instanceof Group && !isFlattened(selected)),
    canGroup: selected instanceof ActiveSelection,
    canUngroup:
      selected instanceof Group &&
      !(selected instanceof ActiveSelection) &&
      !isFlattened(selected),
    objects: canvasRef.current?.getObjects() ?? [],
    canUndo: history.current.canUndo,
    canRedo: history.current.canRedo,
    clear,
    load,
    updateStyle,
    updatePosition,
    addSvg,
    selectionSvg,
    toSvg,
    exportSvg,
    select,
    undo,
    redo,
    group,
    flatten,
    ungroup,
    layer,
    setCanvasZoom,
    snapToGrid,
    setSnapToGrid,
    gridSize,
    setGridSize: (value: number) => {
      if (Number.isFinite(value) && value > 0) setGridSize(Math.round(value));
    },
    rename,
    contextMenu,
    closeContextMenu: () => setContextMenu(null),
    changeVersion,
  };
}

function normalizeObject(object: FabricObject, radiusGridSize = 0) {
  if (!(object instanceof Rect)) return;
  const radius = clampRadius(
    radiusGridSize > 0
      ? Math.round(visualRadius(object) / radiusGridSize) * radiusGridSize
      : visualRadius(object),
    object.width * Math.abs(object.scaleX || 1),
    object.height * Math.abs(object.scaleY || 1),
  );
  setVisualRadius(object, radius);
}

function prepareObject(
  object: FabricObject,
  radiusGridSize = 0,
  onChange?: () => void,
) {
  if (object.stroke) object.set("strokeUniform", true);
  if (object instanceof Rect) {
    setVisualRadius(
      object,
      Math.min(visualRadius(object), maxVisualRadius(object)),
    );
    enableRadiusControl(object, radiusGridSize, onChange);
  }
  if (object instanceof Group)
    object
      .getObjects()
      .forEach((child) => prepareObject(child, radiusGridSize, onChange));
  return object;
}
