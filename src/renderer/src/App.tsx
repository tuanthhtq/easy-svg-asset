import { useEffect, useState } from "react";
import { DEFAULT_AI_STYLE_PRESET } from "../../shared/types";
import type {
  AppSettings,
  AppSettingsInput,
  AiStylePreset,
  LibraryShape,
  Project,
  ProjectSettings,
  RecentFolder,
} from "../../shared/types";
import { validateAiPlan, type AiResponse } from "../../shared/ai";
import { AiBox } from "./components/AiBox";
import { EditorStage } from "./components/EditorStage";
import { Inspector } from "./components/Inspector";
import { ProjectPanel, type Panel } from "./components/ProjectPanel";
import { ToolRail } from "./components/ToolRail";
import { Settings } from "./components/Settings";
import { Welcome } from "./components/Welcome";
import { useCanvasEditor } from "./editor/useCanvasEditor";
import { parsePalettePresets, type PalettePreset } from "./editor/palette";

const PALETTE_STORAGE_KEY = "easy-svg-asset-palettes";
const DEFAULT_APP_SETTINGS: AppSettings = {
  autoSaveDelay: 500,
  aiApiUrl: "https://api.openai.com/v1/responses",
  aiModel: "",
  aiReasoningEffort: "low",
  hasAiSecret: false,
};

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [recent, setRecent] = useState<RecentFolder[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [library, setLibrary] = useState<LibraryShape[]>([]);
  const [fileName, setFileName] = useState("untitled.svg");
  const [openedName, setOpenedName] = useState<string | null>(null);
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "ai" | "styles">(
    "general",
  );
  const [stylePresets, setStylePresets] = useState<AiStylePreset[]>([
    DEFAULT_AI_STYLE_PRESET,
  ]);
  const [palettes, setPalettes] = useState<PalettePreset[]>(() =>
    parsePalettePresets(localStorage.getItem(PALETTE_STORAGE_KEY)),
  );
  const [paletteId, setPaletteId] = useState(palettes[0].id);
  const [panel, setPanel] = useState<Panel>("layers");
  const editor = useCanvasEditor(project);

  useEffect(() => {
    void window.studio.recentFolders().then(setRecent);
    void window.studio.listLibrary().then(setLibrary);
    void window.studio
      .getAppSettings()
      .then(setSettings)
      .catch((error) => window.alert(String(error)));
    void window.studio
      .listAiStylePresets()
      .then(setStylePresets)
      .catch((error) => window.alert(String(error)));
  }, []);

  useEffect(() => {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palettes));
  }, [palettes]);

  useEffect(() => {
    if (!project) return;
    let active = true;
    void window.studio
      .listDocuments()
      .then(async (files) => {
        if (!active) return;
        setDocuments(files);
        const first =
          project.activeDocument && files.includes(project.activeDocument)
            ? project.activeDocument
            : files[0];
        if (first) await loadFile(first);
        else createNew(files);
      })
      .catch((error) => active && window.alert(String(error)));
    return () => {
      active = false;
    };
  }, [project]);

  async function activate(next: Project) {
    setProject(next);
    setRecent(await window.studio.recentFolders());
  }

  async function saveProjectSettings(settings: ProjectSettings) {
    try {
      const next = await window.studio.saveProjectSettings(settings);
      setProject((current) => (current?.root === next.root ? next : current));
    } catch (error) {
      window.alert(String(error));
    }
  }

  async function saveAppSettings(next: AppSettingsInput) {
    setSettings(await window.studio.saveAppSettings(next));
  }

  async function saveAiStylePreset(preset: AiStylePreset) {
    setStylePresets(await window.studio.saveAiStylePreset(preset));
  }

  async function duplicateAiStylePreset(id: string) {
    setStylePresets(await window.studio.duplicateAiStylePreset(id));
  }

  async function deleteAiStylePreset(id: string) {
    const next = await window.studio.deleteAiStylePreset(id);
    setStylePresets(next);
    if (project?.activeAiStylePresetId === id)
      await saveProjectSettings({
        snapToGrid: editor.snapToGrid,
        gridSize: editor.gridSize,
        activeAiStylePresetId:
          next.find((preset) => preset.isDefault)?.id ?? next[0]?.id ?? null,
      });
  }

  async function openFolder() {
    try {
      const next = await window.studio.openFolder();
      if (next) await activate(next);
    } catch (error) {
      window.alert(String(error));
    }
  }

  async function openRecent(folder: RecentFolder) {
    try {
      await activate(await window.studio.openRecent(folder.root));
    } catch (error) {
      window.alert(String(error));
    }
  }

  function createNew(files = documents) {
    editor.clear();
    let index = 1;
    let name = "untitled.svg";
    while (files.includes(name)) name = `untitled-${++index}.svg`;
    setFileName(name);
    setOpenedName(null);
  }

  async function loadFile(name: string) {
    try {
      await editor.load(await window.studio.loadDocument(name));
      setFileName(name);
      setOpenedName(name);
    } catch (error) {
      window.alert(String(error));
    }
  }

  async function save(showError = true) {
    const svg = editor.toSvg();
    if (!svg || !project) return;
    try {
      const name = fileName.toLowerCase().endsWith(".svg")
        ? fileName
        : `${fileName}.svg`;
      if (documents.includes(name) && name !== openedName)
        throw new Error("Choose a new filename or open the existing SVG first");
      await window.studio.saveDocument(name, svg);
      setFileName(name);
      setOpenedName(name);
      setDocuments((all) => (all.includes(name) ? all : [...all, name]));
    } catch (error) {
      if (showError) window.alert(String(error));
    }
  }

  useEffect(() => {
    if (!project || !editor.changeVersion) return;
    const timer = window.setTimeout(
      () => void save(false),
      settings.autoSaveDelay,
    );
    return () => window.clearTimeout(timer);
  }, [editor.changeVersion, settings.autoSaveDelay]);

  async function importSvg() {
    try {
      const result = await window.studio.importSvg();
      if (result) {
        setDocuments((all) =>
          all.includes(result.name) ? all : [...all, result.name],
        );
        await loadFile(result.name);
      }
    } catch (error) {
      window.alert(String(error));
    }
  }

  async function exportPng() {
    const svg = editor.exportSvg();
    if (!project || !svg) return;
    try {
      await window.studio.exportPng(
        fileName.replace(/\.svg$/i, "") || "untitled",
        svg,
      );
    } catch (error) {
      window.alert(String(error));
    }
  }

  async function saveShape() {
    const svg = editor.selectionSvg();
    if (!svg) return;
    setLibrary(
      await window.studio.saveLibraryShape(`shape-${Date.now()}`, svg),
    );
  }

  async function useShape(shape: LibraryShape) {
    await editor.addSvg(await window.studio.useLibraryShape(shape.path));
  }

  function previewAi(response: AiResponse) {
    const activePalette =
      palettes.find((palette) => palette.id === paletteId) ?? palettes[0];
    const scene = editor.sceneContext(activePalette);
    if (scene.sceneVersion !== response.sceneVersion)
      throw new Error("Canvas changed. Generate the preview again.");
    validateAiPlan(response.commands, scene, palettes);
    editor.previewAiCommands(response.commands);
  }

  function approveAi(response: AiResponse) {
    try {
      const activePalette =
        palettes.find((palette) => palette.id === paletteId) ?? palettes[0];
      const scene = editor.sceneContext(activePalette);
      if (scene.sceneVersion !== response.sceneVersion)
        throw new Error(
          "Canvas changed after this proposal. Generate it again.",
        );
      validateAiPlan(response.commands, scene, palettes);
      let nextPalettes = palettes;
      let nextPaletteId = paletteId;
      for (const command of response.commands) {
        if (command.kind === "generate_palette") {
          if (command.mode === "create") {
            const next = {
              id: crypto.randomUUID(),
              name: command.paletteName,
              colors: command.colors,
            };
            nextPalettes = [...nextPalettes, next];
            nextPaletteId = next.id;
          } else {
            nextPalettes = nextPalettes.map((palette) =>
              palette.id === command.targetPaletteId
                ? {
                    ...palette,
                    name: command.paletteName,
                    colors: command.colors,
                  }
                : palette,
            );
          }
        }
        if (
          command.kind === "recolor_objects" &&
          command.paletteSuggestions.length
        )
          nextPalettes = nextPalettes.map((palette) =>
            palette.id === command.paletteId
              ? {
                  ...palette,
                  colors: [
                    ...new Set([
                      ...palette.colors,
                      ...command.paletteSuggestions,
                    ]),
                  ].slice(0, 16),
                }
              : palette,
          );
      }
      setPalettes(nextPalettes);
      setPaletteId(nextPaletteId);
      editor.approveAiCommands(response.commands);
      return true;
    } catch (error) {
      window.alert(String(error));
      return false;
    }
  }

  if (!project)
    return (
      <>
        <Welcome
          recent={recent}
          onOpenFolder={() => void openFolder()}
          onOpenRecent={(folder) => void openRecent(folder)}
          onOpenSettings={() => {
            setSettingsTab("general");
            setSettingsOpen(true);
          }}
        />
        {settingsOpen && (
          <Settings
            settings={settings}
            initialTab={settingsTab}
            stylePresets={stylePresets}
            onClose={() => setSettingsOpen(false)}
            onSave={saveAppSettings}
            onSaveStylePreset={saveAiStylePreset}
            onDuplicateStylePreset={duplicateAiStylePreset}
            onDeleteStylePreset={deleteAiStylePreset}
            onStylePresetsChange={setStylePresets}
          />
        )}
      </>
    );

  return (
    <main className="app-shell">
      <div className="workspace has-inspector">
        <ProjectPanel
          project={project}
          documents={documents}
          library={library}
          fileName={fileName}
          panel={panel}
          objects={editor.objects}
          selected={editor.selected}
          onFileNameChange={setFileName}
          onOpenFolder={() => void openFolder()}
          onLoadFile={(name) => void loadFile(name)}
          onReload={() => void loadFile(fileName)}
          onPanelChange={setPanel}
          onSelectObject={editor.select}
          onRenameObject={editor.rename}
          onSaveShape={() => void saveShape()}
          onUseShape={(shape) => void useShape(shape)}
          onNew={() => createNew()}
          onImport={() => void importSvg()}
          onSave={() => void save()}
          onExport={() => void exportPng()}
        />
        <ToolRail
          tool={editor.tool}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onSelectTool={editor.setTool}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onOpenFolder={() => void openFolder()}
          onOpenSettings={() => {
            setSettingsTab("general");
            setSettingsOpen(true);
          }}
        />
        <EditorStage
          canvasEl={editor.canvasEl}
          stageRef={editor.stageRef}
          fileName={fileName}
          hasSelection={Boolean(editor.selected)}
          contextMenu={editor.contextMenu}
          canGroup={editor.canGroup}
          canFlatten={editor.canFlatten}
          canUngroup={editor.canUngroup}
          zoom={editor.zoom}
          snapToGrid={editor.snapToGrid}
          gridSize={editor.gridSize}
          overlay={
            <AiBox
              scene={editor.sceneContext(
                palettes.find((palette) => palette.id === paletteId) ??
                  palettes[0],
              )}
              onPreview={previewAi}
              onApprove={approveAi}
              onReject={editor.discardAiPreview}
              stylePresets={stylePresets}
              activeStylePresetId={
                stylePresets.some(
                  (preset) => preset.id === project.activeAiStylePresetId,
                )
                  ? project.activeAiStylePresetId!
                  : (stylePresets.find((preset) => preset.isDefault)?.id ??
                    stylePresets[0]?.id ??
                    DEFAULT_AI_STYLE_PRESET.id)
              }
              onStylePresetChange={(activeAiStylePresetId) =>
                void saveProjectSettings({
                  snapToGrid: editor.snapToGrid,
                  gridSize: editor.gridSize,
                  activeAiStylePresetId,
                })
              }
              onManageStyles={() => {
                setSettingsTab("styles");
                setSettingsOpen(true);
              }}
            />
          }
          onLayer={editor.layer}
          onCloseContextMenu={editor.closeContextMenu}
          onGroup={editor.group}
          onFlatten={editor.flatten}
          onUngroup={editor.ungroup}
          onZoom={editor.setCanvasZoom}
          onSnapChange={(value) => {
            editor.setSnapToGrid(value);
            saveProjectSettings({
              snapToGrid: value,
              gridSize: editor.gridSize,
              activeAiStylePresetId: project.activeAiStylePresetId,
            });
          }}
          onGridSizeChange={(value) => {
            editor.setGridSize(value);
            saveProjectSettings({
              snapToGrid: editor.snapToGrid,
              gridSize: value,
              activeAiStylePresetId: project.activeAiStylePresetId,
            });
          }}
        />
        <Inspector
          selected={editor.selected}
          fill={editor.fill}
          stroke={editor.stroke}
          strokeWidth={editor.strokeWidth}
          radius={editor.radius}
          palettes={palettes}
          paletteId={paletteId}
          onPaletteIdChange={setPaletteId}
          onPalettesChange={setPalettes}
          onStrokeWidthChange={(value) =>
            editor.updateStyle("strokeWidth", value)
          }
          onRadiusChange={(value) => {
            editor.setRadius(value);
            editor.updateStyle("rx", value);
          }}
          onPositionChange={editor.updatePosition}
          onSizeChange={editor.updateSize}
          onPaletteColor={(value, target) => {
            if (target === "fill") editor.setFill(value);
            else editor.setStroke(value);
            editor.updateStyle(target, value);
          }}
        />
      </div>
      {settingsOpen && (
        <Settings
          settings={settings}
          initialTab={settingsTab}
          stylePresets={stylePresets}
          onClose={() => setSettingsOpen(false)}
          onSave={saveAppSettings}
          onSaveStylePreset={saveAiStylePreset}
          onDuplicateStylePreset={duplicateAiStylePreset}
          onDeleteStylePreset={deleteAiStylePreset}
          onStylePresetsChange={setStylePresets}
        />
      )}
    </main>
  );
}
