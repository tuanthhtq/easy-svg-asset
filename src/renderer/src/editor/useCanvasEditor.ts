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
import type {
  AiCommand,
  AiPalette,
  AiSceneContext,
  AiShapeSpec,
} from "../../../shared/ai";
import { aiRectRadius } from "../../../shared/ai";
import { isFlattened, markFlattened, restoreFlattened } from "./flatten";
import { History } from "./history";
import {
  clampZoom,
  editorShortcut,
  focusViewport,
  panViewport,
  resizeAxes,
  snapValue,
  wheelZoom,
  type ViewportTransform,
} from "./input";
import { configureGroupInteraction, setAiPreviewState } from "./objectState";
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
import { stripEditorBackground } from "../../../shared/svg";

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
  const aiPreview = useRef<FabricObject[]>([]);
  const aiPreviewHighlight = useRef<Rect | null>(null);
  const editingGroup = useRef<Group | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<FabricObject | null>(null);
  const [fill, setFill] = useState<string | null>("#ff6b4a");
  const [stroke, setStroke] = useState<string | null>("#17191f");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [radius, setRadius] = useState(16);
  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(2);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [changeVersion, setChangeVersion] = useState(0);
  const [, render] = useState(0);
  const fillRef = useRef(fill);
  const strokeRef = useRef(stroke);
  const strokeWidthRef = useRef(strokeWidth);
  const radiusRef = useRef(radius);
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
  strokeWidthRef.current = strokeWidth;
  radiusRef.current = radius;
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
  }, [tool, stroke, strokeWidth, snapToGrid, gridSize]);

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
    aiPreview.current = [];
    editingGroup.current = null;
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
    if (typeof object?.strokeWidth === "number")
      setStrokeWidth(object.strokeWidth);
    if (object instanceof Rect) setRadius(visualRadius(object));
    render((count) => count + 1);
  }

  function exitGroupEditing(selectGroup = false) {
    const canvas = canvasRef.current;
    const group = editingGroup.current;
    if (!canvas || !group) return;
    group.set("interactive", false);
    editingGroup.current = null;
    if (selectGroup) canvas.setActiveObject(group);
    canvas.requestRenderAll();
    refreshSelection();
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
        ctx.strokeStyle = "rgba(236, 234, 229, 0.05)";
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
        const axes = resizeAxes(transform.corner);
        if (axes.width && target.width) {
          const width = snapValue(
            target.width * Math.abs(target.scaleX),
            true,
            gridSizeRef.current,
          );
          target.set("scaleX", width / target.width);
        }
        if (axes.height && target.height) {
          const height = snapValue(
            target.height * Math.abs(target.scaleY),
            true,
            gridSizeRef.current,
          );
          target.set("scaleY", height / target.height);
        }
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
    canvas.on("selection:cleared", () => {
      exitGroupEditing();
      refreshSelection();
    });
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
      if (editingGroup.current && button === 0 && kind === "select") {
        const target = canvas.findTarget(e).target;
        const group = editingGroup.current;
        if (!target || (target !== group && !group.contains(target, true)))
          exitGroupEditing();
      }
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
        strokeWidth: strokeWidthRef.current,
      });
      canvas.setActiveObject(draft.object);
      canvas.requestRenderAll();
      commit();
      refreshSelection();
      setTool("select");
    };
    const handleDoubleClick = ({ target, subTargets }: TPointerEventInfo) => {
      const group =
        target instanceof Group && !(target instanceof ActiveSelection)
          ? target
          : target?.group instanceof Group &&
              !(target.group instanceof ActiveSelection)
            ? target.group
            : null;
      const child = target === group ? subTargets?.[0] : target;
      if (!group || !child || isFlattened(group)) return;
      if (editingGroup.current && editingGroup.current !== group)
        editingGroup.current.set("interactive", false);
      group.set({ interactive: true, subTargetCheck: true });
      editingGroup.current = group;
      canvas.setActiveObject(child);
      canvas.requestRenderAll();
      refreshSelection();
    };
    canvas.on("mouse:down", handlePointerDown);
    canvas.on("mouse:dblclick", handleDoubleClick);
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
      if (event.key === "Escape" && editingGroup.current) {
        event.preventDefault();
        exitGroupEditing(true);
        return;
      }
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
      canvas.off("mouse:dblclick", handleDoubleClick);
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
      aiPreview.current = [];
      editingGroup.current = null;
    };
  }, [project]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    restoring.current = true;
    canvas.clear();
    penDraft.current = { points: [], anchors: [] };
    shapeDraft.current = null;
    aiPreview.current = [];
    editingGroup.current = null;
    canvas.requestRenderAll();
    restoring.current = false;
    setSelected(null);
    setContextMenu(null);
    history.current.reset(snapshot());
    setDocumentSize(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
    setChangeVersion((value) => value + 1);
    render((count) => count + 1);
  }

  async function load(svg: string) {
    const parsed = await loadSVGFromString(
      stripEditorBackground(svg),
      restoreFlattened,
    );
    const canvas = canvasRef.current;
    if (!canvas) return;
    restoring.current = true;
    try {
      canvas.clear();
      penDraft.current = { points: [], anchors: [] };
      shapeDraft.current = null;
      aiPreview.current = [];
      editingGroup.current = null;
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
    setChangeVersion((value) => value + 1);
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
      strokeWidth: strokeWidthRef.current,
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
        strokeWidth: Math.max(1, strokeWidthRef.current),
      });
      draft.preview.setBoundingBox(true);
      draft.preview.setCoords();
    } else {
      draft.preview = new Polyline(points, {
        fill: "",
        stroke: strokeRef.current ?? PREVIEW_STROKE,
        strokeWidth: Math.max(1, strokeWidthRef.current),
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
      strokeWidth: strokeWidthRef.current,
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
    key: "fill" | "stroke" | "strokeWidth" | "rx",
    value: string | number | null,
  ) {
    if (
      key === "strokeWidth" &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    )
      return;
    if (key === "strokeWidth") setStrokeWidth(Number(value));
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

  function updateSize(key: "width" | "height", value: number) {
    const object = canvasRef.current?.getActiveObject();
    const baseSize = object?.[key];
    if (!object || !baseSize || !Number.isFinite(value) || value <= 0) return;
    const size = snapValue(value, snapToGridRef.current, gridSizeRef.current);
    const scaleKey = key === "width" ? "scaleX" : "scaleY";
    const direction = Math.sign(object[scaleKey] ?? 1) || 1;
    object.set(scaleKey, (direction * Math.max(1, size)) / baseSize);
    normalizeObject(object, snapGridSize());
    object.setCoords();
    canvasRef.current?.requestRenderAll();
    commit();
    refreshSelection();
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

  function createAiShape(shape: AiShapeSpec) {
    const common = {
      angle: shape.rotation,
      fill: shape.fill,
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
      strokeUniform: true,
      name: shape.name,
      id: crypto.randomUUID(),
    };
    if (shape.type === "pen")
      return prepareObject(
        new Polygon(shape.points!, common),
        snapGridSize(),
        refreshSelection,
      );
    const bounds = {
      ...common,
      left: shape.x!,
      top: shape.y!,
      width: shape.width!,
      height: shape.height!,
      originX: "left" as const,
      originY: "top" as const,
    };
    const object =
      shape.type === "rect"
        ? new Rect({
            ...bounds,
            rx: aiRectRadius(radiusRef.current, shape.width!, shape.height!),
            ry: aiRectRadius(radiusRef.current, shape.width!, shape.height!),
          })
        : shape.type === "ellipse"
          ? new Ellipse({
              ...bounds,
              rx: shape.width! / 2,
              ry: shape.height! / 2,
            })
          : new Triangle(bounds);
    return prepareObject(object, snapGridSize(), refreshSelection);
  }

  function sceneContext(activePalette: AiPalette): AiSceneContext {
    const canvas = canvasRef.current;
    const objects =
      canvas?.getObjects().filter((object) => !object.excludeFromExport) ?? [];
    const active = new Set(canvas?.getActiveObjects() ?? []);
    return {
      canvas: {
        width: canvasWidthRef.current,
        height: canvasHeightRef.current,
      },
      objects: objects.map((object, zIndex) => {
        const item = object as FabricObject & { id?: string; name?: string };
        const bounds = object.getBoundingRect();
        return {
          id: ensureObjectId(object),
          type: object.type,
          name: item.name || object.type,
          bounds: {
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
          },
          rotation: object.angle,
          zIndex,
          fill: typeof object.fill === "string" ? object.fill : null,
          stroke: typeof object.stroke === "string" ? object.stroke : null,
          strokeWidth: object.strokeWidth,
          radius: object instanceof Rect ? visualRadius(object) : null,
        };
      }),
      selectedObjectIds: objects
        .filter((object) => active.has(object))
        .map(ensureObjectId),
      activePalette,
      settings: {
        strokeWidth: strokeWidthRef.current,
        radius: radiusRef.current,
        snapToGrid: snapToGridRef.current,
        gridSize: gridSizeRef.current,
      },
      sceneVersion: changeVersion,
    };
  }

  function discardAiPreview() {
    const canvas = canvasRef.current;
    if (!canvas || (!aiPreview.current.length && !aiPreviewHighlight.current))
      return;
    restoring.current = true;
    canvas.remove(...aiPreview.current);
    if (aiPreviewHighlight.current) canvas.remove(aiPreviewHighlight.current);
    restoring.current = false;
    aiPreview.current = [];
    aiPreviewHighlight.current = null;
    canvas.requestRenderAll();
    refreshSelection();
  }

  function previewAiCommands(commands: AiCommand[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    discardAiPreview();
    const objects: FabricObject[] = [];
    for (const command of commands) {
      let object: FabricObject | null = null;
      if (command.kind === "create_shape")
        object = createAiShape(command.shape);
      else if (command.kind === "create_asset") {
        const group = new Group(command.children.map(createAiShape));
        Object.assign(group, {
          name: command.groupName,
          id: crypto.randomUUID(),
        });
        object = prepareObject(group, snapGridSize(), refreshSelection);
      }
      if (object) objects.push(setAiPreviewState(object, true));
    }
    if (!objects.length) return;
    restoring.current = true;
    canvas.add(...objects);
    aiPreview.current = objects;
    const bounds = objects.reduce(
      (current, object) => {
        const box = object.getBoundingRect();
        const right = box.left + box.width;
        const bottom = box.top + box.height;
        return {
          left: Math.min(current.left, box.left),
          top: Math.min(current.top, box.top),
          right: Math.max(current.right, right),
          bottom: Math.max(current.bottom, bottom),
        };
      },
      {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      },
    );
    const padding = 10;
    const highlight = new Rect({
      left: bounds.left - padding,
      top: bounds.top - padding,
      width: bounds.right - bounds.left + padding * 2,
      height: bounds.bottom - bounds.top + padding * 2,
      originX: "left",
      originY: "top",
      fill: "transparent",
      stroke: PREVIEW_STROKE,
      strokeWidth: 2,
      strokeDashArray: [8, 6],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    aiPreviewHighlight.current = highlight;
    canvas.add(highlight);
    restoring.current = false;
    canvas.setViewportTransform(
      focusViewport(
        canvas.viewportTransform as ViewportTransform,
        {
          x: (bounds.left + bounds.right) / 2,
          y: (bounds.top + bounds.bottom) / 2,
        },
        canvas.getWidth(),
        canvas.getHeight(),
      ),
    );
    canvas.requestRenderAll();
  }

  function approveAiCommands(commands: AiCommand[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const byId = new Map(
      canvas
        .getObjects()
        .filter((object) => !object.excludeFromExport)
        .map((object) => [ensureObjectId(object), object]),
    );
    const previews = aiPreview.current;
    let changed = Boolean(previews.length);
    restoring.current = true;
    try {
      if (aiPreviewHighlight.current) canvas.remove(aiPreviewHighlight.current);
      aiPreviewHighlight.current = null;
      previews.forEach((object) => setAiPreviewState(object, false));
      for (const command of commands) {
        if (command.kind === "recolor_objects") {
          command.changes.forEach((change) => {
            const object = byId.get(change.objectId);
            if (object) {
              setObjectPaint(object, change.fill, change.stroke);
              changed = true;
            }
          });
        }
      }
      aiPreview.current = [];
      const lastCreated = previews.at(-1);
      if (lastCreated) canvas.setActiveObject(lastCreated);
      if (changed) canvas.requestRenderAll();
    } finally {
      restoring.current = false;
    }
    if (changed) {
      commit();
      refreshSelection();
    }
  }

  function selectionSvg() {
    const object = canvasRef.current?.getActiveObject();
    if (!object) return null;
    const box = object.getBoundingRect();
    const svg = addObjectNames(object.toSVG(), [object]);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(box.width)}" height="${Math.ceil(box.height)}" viewBox="${box.left} ${box.top} ${box.width} ${box.height}">${svg}</svg>`;
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
    return addObjectNames(svg, canvas.getObjects());
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
    exitGroupEditing();
    const group =
      object.group instanceof Group &&
      !(object.group instanceof ActiveSelection) &&
      !isFlattened(object.group)
        ? object.group
        : null;
    if (group) {
      group.set({ interactive: true, subTargetCheck: true });
      editingGroup.current = group;
    }
    canvas.setActiveObject(object);
    if (!object.isOnScreen())
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
    const grouped = prepareObject(
      new Group(objects),
      snapGridSize(),
      refreshSelection,
    );
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
    strokeWidth,
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
    objects:
      canvasRef.current
        ?.getObjects()
        .filter((object) => !object.excludeFromExport) ?? [],
    canUndo: history.current.canUndo,
    canRedo: history.current.canRedo,
    clear,
    load,
    updateStyle,
    updatePosition,
    updateSize,
    addSvg,
    sceneContext,
    previewAiCommands,
    approveAiCommands,
    discardAiPreview,
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
  ensureObjectId(object);
  if (object.stroke) object.set("strokeUniform", true);
  if (object instanceof Rect) {
    setVisualRadius(
      object,
      Math.min(visualRadius(object), maxVisualRadius(object)),
    );
    enableRadiusControl(object, radiusGridSize, onChange);
  }
  if (object instanceof Group && !(object instanceof ActiveSelection)) {
    configureGroupInteraction(object, !isFlattened(object));
    object
      .getObjects()
      .forEach((child) => prepareObject(child, radiusGridSize, onChange));
  }
  return object;
}

function ensureObjectId(object: FabricObject) {
  const item = object as FabricObject & { id?: string };
  if (!item.id) item.id = crypto.randomUUID();
  return item.id;
}

function setObjectPaint(
  object: FabricObject,
  fill: string | null,
  stroke: string | null,
) {
  object.set({ fill, stroke });
  if (object instanceof Group)
    object.getObjects().forEach((child) => setObjectPaint(child, fill, stroke));
}

function addObjectNames(svg: string, objects: FabricObject[]) {
  return objects.reduce((value, object) => {
    const item = object as FabricObject & { id?: string; name?: string };
    if (!item.id || !item.name) return value;
    const id = item.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const name = item.name.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[character] ?? character,
    );
    return value.replace(
      new RegExp(`id="${id}"`),
      `id="${item.id}" data-name="${name}"`,
    );
  }, svg);
}
