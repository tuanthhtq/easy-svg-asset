import assert from "node:assert/strict";
import { test } from "node:test";
import { Group, Point, Rect } from "fabric";
import {
  liveInputValue,
  normalizeInputValue,
} from "../src/renderer/src/components/appInputValue.ts";
import {
  isFlattened,
  markFlattened,
  restoreFlattened,
} from "../src/renderer/src/editor/flatten.ts";
import { layerTreeRows } from "../src/renderer/src/editor/layers.ts";
import {
  canClosePen,
  shapeBounds,
  squareBounds,
} from "../src/renderer/src/editor/shape.ts";
import {
  clampRadius,
  enableRadiusControl,
  maxVisualRadius,
  setVisualRadius,
  snapRadius,
  visualRadius,
} from "../src/renderer/src/editor/roundedRect.ts";
import {
  clampZoom,
  editorShortcut,
  focusViewport,
  panViewport,
  resizeAxes,
  snapValue,
  wheelZoom,
} from "../src/renderer/src/editor/input.ts";
import {
  parsePalettePresets,
  resolvePaletteId,
} from "../src/renderer/src/editor/palette.ts";
import {
  aiRectRadius,
  applyAiPaletteUpdate,
  compactAiScene,
  parseAiCommand,
  validateAiPlan,
} from "../src/shared/ai.ts";
import { fitImageSize } from "../src/renderer/src/components/promptImage.ts";
import { History } from "../src/renderer/src/editor/history.ts";
import {
  configureGroupInteraction,
  setAiPreviewState,
} from "../src/renderer/src/editor/objectState.ts";
import {
  ensureProject,
  setActiveDocument,
  setProjectSettings,
} from "../src/shared/project.ts";
import { stripEditorBackground, validateSvg } from "../src/shared/svg.ts";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeAiLogger, logAiEvent } from "../src/main/ai-logger.ts";
import {
  addAiStyleReference,
  deleteAiStylePreset,
  duplicateAiStylePreset,
  listAiStylePresets,
  loadAiStyleReference,
  removeAiStyleReference,
  saveAiStylePreset,
} from "../src/main/ai-style-presets.ts";
import {
  AI_REASONING_EFFORTS,
  isAiReasoningEffort,
} from "../src/shared/types.ts";

test("rectangle radius stays within its geometry", () => {
  assert.equal(clampRadius(-10, 180, 120), 0);
  assert.equal(clampRadius(24, 180, 120), 24);
  assert.equal(clampRadius(100, 180, 120), 60);
});

test("rectangle radius follows the active grid size", () => {
  assert.equal(snapRadius(27, 20), 20);
  assert.equal(snapRadius(31, 20), 40);
  assert.equal(snapRadius(31, 0), 31);
});

test("rectangle radius stays circular after non-uniform scaling", () => {
  const rect = new Rect({ width: 100, height: 100, rx: 20, ry: 20 });
  rect.set({ scaleX: 2, scaleY: 4 });
  setVisualRadius(rect, 20);
  assert.equal(visualRadius(rect), 20);
  assert.equal(rect.rx * rect.scaleX, rect.ry * rect.scaleY);
  assert.equal(maxVisualRadius(rect), 100);
});

test("rectangle radius removes scaling floating-point noise", () => {
  const rect = new Rect({
    width: 100,
    height: 100,
    rx: 1.99999999,
    ry: 1.99999999,
  });
  assert.equal(visualRadius(rect), 2);
});

test("null paints export as no fill and no stroke", () => {
  const svg = new Rect({
    width: 100,
    height: 100,
    fill: null,
    stroke: null,
  }).toSVG();
  assert.match(svg, /fill: none/);
  assert.match(svg, /stroke: none/);
});

test("SVG export preserves stroke width", () => {
  const svg = new Rect({
    width: 100,
    height: 100,
    stroke: "#000000",
    strokeWidth: 7.5,
    strokeUniform: true,
  }).toSVG();
  assert.match(svg, /stroke-width: 7\.5/);
  assert.match(svg, /vector-effect="non-scaling-stroke"/);
});

test("rectangle radius handle is visible below the top-left scale handle", () => {
  const rect = enableRadiusControl(new Rect({ width: 180, height: 120 }));
  const control = rect.controls.radius;
  const point = control.positionHandler(
    new Point(180, 120),
    [1, 0, 0, 1, 0, 0],
    rect,
    control,
  );
  assert.deepEqual({ x: point.x, y: point.y }, { x: -90, y: -46 });
});

test("shape drag uses the rectangle formed by its start and end points", () => {
  assert.deepEqual(shapeBounds({ x: 300, y: 200 }, { x: 100, y: 260 }), {
    left: 100,
    top: 200,
    width: 200,
    height: 60,
  });
});

test("export bounds crop all objects into a centered square", () => {
  assert.deepEqual(
    squareBounds([
      { left: 10.2, top: 20.4, width: 30, height: 10 },
      { left: 50, top: 40, width: 10.1, height: 20.2 },
    ]),
    { left: 10, top: 15, width: 51, height: 51 },
  );
  assert.equal(squareBounds([]), null);
});

test("pen closes only near its first anchor after three points", () => {
  const points = [
    { x: 10, y: 10 },
    { x: 80, y: 10 },
    { x: 80, y: 80 },
  ];
  assert.equal(canClosePen(points.slice(0, 2), { x: 10, y: 10 }, 12), false);
  assert.equal(canClosePen(points, { x: 18, y: 16 }, 12), true);
  assert.equal(canClosePen(points, { x: 30, y: 30 }, 12), false);
});

test("editor shortcuts and grid snapping stay predictable", () => {
  assert.equal(editorShortcut("z", true, false), "undo");
  assert.equal(editorShortcut("z", true, true), "redo");
  assert.equal(editorShortcut("y", true, false), "redo");
  assert.equal(editorShortcut("Backspace", false, false), "delete");
  assert.equal(editorShortcut("d", true, false), "duplicate");
  assert.equal(snapValue(37, true, 20), 40);
  assert.equal(snapValue(37, false, 20), 37);
});

test("app inputs commit like the grid size field", () => {
  assert.equal(normalizeInputValue("", 2, 1, undefined, true), 2);
  assert.equal(normalizeInputValue("-4", 2, 1, undefined, true), 2);
  assert.equal(normalizeInputValue("3.6", 2, 1, undefined, true), 4);
  assert.equal(normalizeInputValue("-4", 0), -4);
  assert.equal(liveInputValue("", 1), null);
  assert.equal(liveInputValue("1.", 1), null);
  assert.equal(liveInputValue("-4", 0), null);
  assert.equal(liveInputValue("4", 1, undefined, true), 4);
});

test("prompt images fit within the AI image limit", () => {
  assert.deepEqual(fitImageSize(3200, 1200), { width: 1600, height: 600 });
  assert.deepEqual(fitImageSize(800, 600), { width: 800, height: 600 });
});

test("side resize changes only its own axis", () => {
  assert.deepEqual(resizeAxes("mr"), { width: true, height: false });
  assert.deepEqual(resizeAxes("mb"), { width: false, height: true });
  assert.deepEqual(resizeAxes("br"), { width: true, height: true });
});

test("infinite workspace pan and zoom preserve viewport scale", () => {
  assert.deepEqual(
    panViewport([2, 0, 0, 2, 10, 20], -5, 8),
    [2, 0, 0, 2, 5, 28],
  );
  assert.equal(clampZoom(0), 0.1);
  assert.equal(clampZoom(20), 8);
  assert.ok(wheelZoom(1, -100) > 1);
  assert.ok(wheelZoom(1, 100) < 1);
  assert.deepEqual(
    focusViewport([2, 0, 0, 2, 10, 20], { x: 100, y: 50 }, 800, 600),
    [2, 0, 0, 2, 200, 200],
  );
});

test("palette presets reject invalid saved data", () => {
  assert.equal(parsePalettePresets("broken")[0].id, "warm");
  assert.equal(
    parsePalettePresets(
      JSON.stringify([{ id: "ocean", name: "Ocean", colors: ["#123abc"] }]),
    )[0].name,
    "Ocean",
  );
  assert.equal(
    parsePalettePresets(
      JSON.stringify([{ id: "bad", name: "Bad", colors: ["red"] }]),
    )[0].id,
    "warm",
  );
});

test("active palette selection survives restart with a safe fallback", () => {
  const palettes = [
    { id: "warm", name: "Warm", colors: ["#123456"] },
    { id: "farm", name: "Farm", colors: ["#abcdef"] },
  ];
  assert.equal(resolvePaletteId(palettes, "farm"), "farm");
  assert.equal(resolvePaletteId(palettes, "missing"), "warm");
  assert.equal(resolvePaletteId(palettes, null), "warm");
});

test("AI plan validation rejects overlap and palette violations", () => {
  const shape = {
    type: "rect",
    name: "land",
    x: 20,
    y: 20,
    width: 40,
    height: 40,
    rotation: 0,
    fill: "#123456",
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    points: null,
  };
  const scene = {
    canvas: { width: 200, height: 200 },
    objects: [
      {
        id: "existing",
        type: "rect",
        name: "Existing",
        bounds: { left: 0, top: 0, width: 50, height: 50 },
        rotation: 0,
        zIndex: 0,
        fill: "#ffffff",
        stroke: null,
        strokeWidth: 0,
        radius: null,
      },
    ],
    selectedObjectIds: [],
    activePalette: { id: "warm", name: "Warm", colors: ["#123456"] },
    settings: {
      strokeWidth: 4,
      radius: 8,
      snapToGrid: false,
      gridSize: 8,
    },
    sceneVersion: 1,
  };
  shape.radius = 8;
  assert.throws(
    () =>
      validateAiPlan([{ kind: "create_shape", shape }], scene, [
        scene.activePalette,
      ]),
    /over an existing object/,
  );
  const recolor = parseAiCommand("recolor_objects", {
    paletteId: "warm",
    paletteSuggestions: [],
    changes: [{ objectId: "existing", fill: "#ff0000", stroke: null }],
  });
  assert.throws(
    () => validateAiPlan([recolor], scene, [scene.activePalette]),
    /outside the palette/,
  );
  assert.throws(
    () =>
      validateAiPlan(
        [
          {
            kind: "create_shape",
            shape: { ...shape, x: 100, y: 100, fill: "#ff0000" },
          },
        ],
        scene,
        [scene.activePalette],
      ),
    /outside the active palette/,
  );
  assert.throws(
    () =>
      validateAiPlan(
        [
          {
            kind: "create_shape",
            shape: {
              ...shape,
              x: 100,
              y: 100,
              stroke: "#123456",
              strokeWidth: 2,
            },
          },
        ],
        scene,
        [scene.activePalette],
      ),
    /inconsistent stroke width/,
  );
  assert.throws(
    () =>
      validateAiPlan(
        [
          {
            kind: "create_shape",
            shape: { ...shape, x: 100, y: 100, radius: 2 },
          },
        ],
        scene,
        [scene.activePalette],
      ),
    /inconsistent corner radius/,
  );
});

test("AI assets require a named group and valid child shapes", () => {
  const command = parseAiCommand("create_asset", {
    groupName: "Farm plot",
    children: [
      {
        type: "rect",
        name: "field",
        x: 20,
        y: 20,
        width: 40,
        height: 40,
        rotation: 0,
        fill: "#123456",
        stroke: null,
        strokeWidth: 0,
        radius: 0,
        points: null,
      },
      {
        type: "ellipse",
        name: "pond",
        x: 28,
        y: 28,
        width: 12,
        height: 8,
        rotation: 0,
        fill: "#abcdef",
        stroke: null,
        strokeWidth: 0,
        radius: 0,
        points: null,
      },
    ],
  });
  assert.equal(command.kind, "create_asset");
  assert.equal(command.groupName, "Farm plot");
  assert.throws(
    () => parseAiCommand("create_asset", { groupName: "", children: [] }),
    /group name|asset needs/,
  );
  assert.throws(
    () =>
      parseAiCommand("create_asset", {
        groupName: "Too detailed",
        children: Array.from({ length: 9 }, () => ({
          type: "rect",
          name: "part",
          x: 20,
          y: 20,
          width: 4,
          height: 4,
          rotation: 0,
          fill: "#123456",
          stroke: null,
          strokeWidth: 0,
          radius: 0,
          points: null,
        })),
      }),
    /asset needs 2 to 8 shapes/,
  );
});

test("AI scene payload is compact and includes palettes and drawing settings", () => {
  const scene = compactAiScene(
    {
      canvas: { width: 1200, height: 760 },
      objects: [
        {
          id: "shape-1",
          type: "rect",
          name: "Field",
          bounds: { left: 1, top: 2, width: 3, height: 4 },
          rotation: 5,
          zIndex: 0,
          fill: "#ffffff",
          stroke: "#000000",
          strokeWidth: 4,
          radius: 16,
        },
      ],
      selectedObjectIds: [],
      activePalette: { id: "warm", name: "Warm", colors: ["#123456"] },
      settings: {
        strokeWidth: 4,
        radius: 16,
        snapToGrid: true,
        gridSize: 8,
      },
      sceneVersion: 3,
    },
    [
      { id: "warm", name: "Warm", colors: ["#123456"] },
      { id: "farm", name: "Farm Pop", colors: ["#abcdef"] },
    ],
  );
  assert.deepEqual(scene.c, [1200, 760]);
  assert.deepEqual(scene.d, [4, 16, true, 8]);
  assert.equal(scene.p, "warm");
  assert.deepEqual(scene.l, [
    ["warm", "Warm", ["#123456"]],
    ["farm", "Farm Pop", ["#abcdef"]],
  ]);
  assert.deepEqual(scene.o, [
    ["shape-1", "rect", "Field", 1, 2, 3, 4, 5, 0, 4, 16],
  ]);
  assert.equal(scene.v, 3);
});

test("AI palette updates support replace, append, and selected colors", () => {
  const current = ["#111111", "#222222", "#333333"];
  const proposed = ["#aaaaaa", "#bbbbbb", "#cccccc"];
  assert.deepEqual(
    applyAiPaletteUpdate(current, proposed, "replace"),
    proposed,
  );
  assert.deepEqual(
    applyAiPaletteUpdate(current, ["#222222", "#444444"], "append"),
    [...current, "#444444"],
  );
  assert.deepEqual(
    applyAiPaletteUpdate(current, proposed, "selected", [0, 2]),
    ["#aaaaaa", "#222222", "#cccccc"],
  );
  assert.throws(
    () => applyAiPaletteUpdate(current, proposed, "selected"),
    /Select at least one color/,
  );
});

test("AI rectangles use the authoritative radius within their bounds", () => {
  assert.equal(aiRectRadius(16, 40, 20), 10);
  assert.equal(aiRectRadius(6, 40, 20), 6);
  assert.equal(aiRectRadius(-2, 40, 20), 0);
});

test("AI previews stay temporary until approval", () => {
  const object = setAiPreviewState(new Rect({ width: 10, height: 10 }), true);
  assert.equal(object.excludeFromExport, true);
  assert.equal(object.selectable, false);
  assert.equal(object.evented, false);
  assert.equal(object.opacity, 0.72);
  setAiPreviewState(object, false);
  assert.equal(object.excludeFromExport, false);
  assert.equal(object.selectable, true);
  assert.equal(object.evented, true);
  assert.equal(object.opacity, 1);
});

test("groups support drill-in while flattened groups stay atomic", () => {
  const group = configureGroupInteraction(
    new Group([new Rect({ width: 10, height: 10 })]),
    true,
  );
  assert.equal(group.subTargetCheck, true);
  assert.equal(group.interactive, false);
  const flattened = configureGroupInteraction(
    markFlattened(new Group([new Rect({ width: 10, height: 10 })])),
    false,
  );
  assert.equal(flattened.subTargetCheck, false);
  assert.equal(flattened.interactive, false);
});

test("layer tree follows group hierarchy and reverse z-order", () => {
  const back = new Rect({ width: 10, height: 10 });
  const first = new Rect({ width: 10, height: 10 });
  const second = new Rect({ width: 10, height: 10 });
  const group = new Group([first, second]);
  assert.deepEqual(
    layerTreeRows([back, group], new Set([group])).map(({ object, depth }) => [
      object,
      depth,
    ]),
    [
      [group, 0],
      [second, 1],
      [first, 1],
      [back, 0],
    ],
  );
  markFlattened(group);
  assert.deepEqual(
    layerTreeRows([group], new Set([group])).map(({ object, depth }) => [
      object,
      depth,
    ]),
    [[group, 0]],
  );
});

test("flattened groups survive editor history serialization", async () => {
  const group = markFlattened(new Group([new Rect({ width: 10, height: 10 })]));
  group.name = "Farm asset";
  const restored = await Group.fromObject(group.toObject());
  assert.equal(isFlattened(restored), true);
  assert.equal(restored.name, "Farm asset");
  assert.match(String(restored.id), /^easy-svg-flattened-/);
  assert.match(group.toSVG(), /id="easy-svg-flattened-/);

  const restoredFromSvg = new Group();
  restoreFlattened({ id: String(group.id) }, restoredFromSvg);
  assert.equal(isFlattened(restoredFromSvg), true);

  const flattenedByFabric = new Rect({ id: String(group.id) });
  restoreFlattened({ id: "" }, flattenedByFabric);
  assert.equal(isFlattened(flattenedByFabric), true);

  const namedGroup = new Group();
  restoreFlattened(
    { id: "asset-id", getAttribute: () => "Farm asset" },
    namedGroup,
  );
  assert.equal(namedGroup.name, "Farm asset");
});
test("history supports undo, redo, and branch truncation", () => {
  const history = new History();
  history.reset("a");
  history.push("b");
  history.push("c");
  assert.equal(history.undo(), "b");
  assert.equal(history.undo(), "a");
  assert.equal(history.redo(), "b");
  history.push("d");
  assert.equal(history.canRedo, false);
  assert.equal(history.undo(), "b");
});

test("SVG validation rejects active content", () => {
  assert.match(
    validateSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    ),
    /^<svg/,
  );
  assert.throws(
    () => validateSvg("<svg><script>alert(1)</script></svg>"),
    /unsafe SVG/,
  );
  assert.throws(
    () => validateSvg('<svg><image href="file:///secret"/></svg>'),
    /unsafe SVG/,
  );
  assert.match(validateSvg('<svg><rect fill="url(#paint)"/></svg>'), /^<svg/);
  assert.throws(
    () => validateSvg('<svg><rect fill="url(https://example.com/x)"/></svg>'),
    /unsafe SVG/,
  );
});

test("opening an editor SVG does not turn its canvas background into a layer", () => {
  const svg = `<svg><defs></defs>
<rect x="0" y="0" width="100%" height="100%" fill="#fbfaf7"></rect>
<g><rect width="10" height="10" fill="#fbfaf7"></rect></g></svg>`;
  const cleaned = stripEditorBackground(svg);
  assert.doesNotMatch(cleaned, /width="100%"/);
  assert.match(cleaned, /width="10"/);
});

test("opening any folder creates a manifest and records the active SVG", async () => {
  const root = await mkdtemp(join(tmpdir(), "easy-svg-asset-"));
  try {
    const project = await ensureProject(root);
    assert.equal(project.activeDocument, null);
    assert.equal(project.snapToGrid, false);
    assert.equal(project.gridSize, 2);
    assert.equal(project.activeAiStylePresetId, null);
    await Promise.all([
      setActiveDocument(project, "icon.svg"),
      setProjectSettings(project, {
        snapToGrid: true,
        gridSize: 12,
        activeAiStylePresetId: "cozy-farming",
      }),
    ]);
    const manifest = JSON.parse(await readFile(project.manifest, "utf8"));
    assert.equal(manifest.activeDocument, "icon.svg");
    assert.equal(manifest.snapToGrid, true);
    assert.equal(manifest.gridSize, 12);
    assert.equal(manifest.activeAiStylePresetId, "cozy-farming");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project settings survive reopening an older manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "easy-svg-asset-"));
  try {
    const project = await ensureProject(root);
    await writeFile(
      project.manifest,
      JSON.stringify({
        name: project.name,
        root: project.root,
        manifest: project.manifest,
        activeDocument: null,
      }),
    );
    const reopened = await ensureProject(root);
    const manifest = JSON.parse(await readFile(reopened.manifest, "utf8"));
    assert.equal(reopened.snapToGrid, false);
    assert.equal(reopened.gridSize, 2);
    assert.equal(reopened.activeAiStylePresetId, null);
    assert.equal(manifest.snapToGrid, false);
    assert.equal(manifest.gridSize, 2);
    assert.equal(manifest.activeAiStylePresetId, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AI logger writes JSON and retains only five app sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "easy-svg-ai-log-"));
  try {
    for (let index = 0; index < 6; index++) {
      await initializeAiLogger(root, "test");
      await logAiEvent("test", { index, secret: "[REDACTED]" });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const directory = join(root, "ai-logs");
    const files = await readdir(directory);
    assert.equal(files.length, 5);
    const latest = JSON.parse(
      await readFile(join(directory, files.sort().at(-1)), "utf8"),
    );
    assert.equal(latest.appVersion, "test");
    assert.equal(latest.events[0].type, "test");
    assert.equal(latest.events[0].data.index, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("global AI style presets persist rules and bounded references", async () => {
  const root = await mkdtemp(join(tmpdir(), "easy-svg-style-presets-"));
  try {
    const created = await saveAiStylePreset(root, {
      id: "cozy-farming",
      name: "Cozy Farming",
      isDefault: false,
      instruction: "Keep silhouettes readable.",
      terrainView: "orthographic_top_down",
      propView: "three_quarter_top_down",
      buildingView: "three_quarter_top_down",
      noVisibleSideFacesForTerrain: true,
      detailLevel: "minimal",
      referenceImages: [],
    });
    assert.equal(
      created.some((preset) => preset.id === "cozy-farming"),
      true,
    );
    await assert.rejects(
      saveAiStylePreset(root, {
        ...created[0],
        id: "forged-reference",
        referenceImages: [
          { id: "missing", name: "missing.png", mimeType: "image/png" },
        ],
      }),
      /cannot reference missing images/,
    );
    for (let index = 0; index < 3; index++)
      await addAiStyleReference(root, "cozy-farming", `sample-${index}.png`, {
        mimeType: "image/png",
        data: Buffer.from(`reference-${index}`).toString("base64"),
      });
    const listed = await listAiStylePresets(root);
    const preset = listed.find((item) => item.id === "cozy-farming");
    assert.equal(preset?.referenceImages.length, 3);
    const loaded = await loadAiStyleReference(
      root,
      "cozy-farming",
      preset.referenceImages[0].id,
    );
    assert.equal(Buffer.from(loaded.data, "base64").toString(), "reference-0");
    await assert.rejects(
      addAiStyleReference(root, "cozy-farming", "sample-4.png", {
        mimeType: "image/png",
        data: Buffer.from("reference-4").toString("base64"),
      }),
      /up to 3 reference images/,
    );
    const copied = await duplicateAiStylePreset(root, "cozy-farming");
    const copy = copied.find((preset) => preset.name === "Cozy Farming Copy");
    assert.ok(copy);
    await removeAiStyleReference(
      root,
      "cozy-farming",
      preset.referenceImages[0].id,
    );
    const defaulted = await saveAiStylePreset(root, {
      ...preset,
      isDefault: true,
    });
    assert.equal(
      defaulted.find((item) => item.id === "cozy-farming")?.isDefault,
      true,
    );
    assert.equal(
      defaulted.find((item) => item.id === "default-game-assets")?.isDefault,
      false,
    );
    const remaining = await deleteAiStylePreset(root, copy.id);
    assert.equal(
      remaining.some((preset) => preset.id === copy.id),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AI style presets migrate saved data without a default marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "easy-svg-style-migration-"));
  try {
    const directory = join(root, "ai-style-presets");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "presets.json"),
      JSON.stringify([
        {
          id: "legacy",
          name: "Legacy",
          instruction: "",
          terrainView: "orthographic_top_down",
          propView: "three_quarter_top_down",
          buildingView: "three_quarter_top_down",
          noVisibleSideFacesForTerrain: true,
          detailLevel: "minimal",
          referenceImages: [],
        },
      ]),
    );
    const [preset] = await listAiStylePresets(root);
    assert.equal(preset.id, "legacy");
    assert.equal(preset.isDefault, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AI reasoning settings accept every 9Router thinking level", () => {
  assert.deepEqual(AI_REASONING_EFFORTS, [
    "auto",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
  ]);
  assert.equal(isAiReasoningEffort("low"), true);
  assert.equal(isAiReasoningEffort("none"), false);
});
