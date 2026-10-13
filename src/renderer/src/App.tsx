import { useEffect, useState } from "react";
import type {
  LibraryShape,
  Project,
  ProjectSettings,
  RecentFolder,
} from "../../shared/types";
import { EditorStage } from "./components/EditorStage";
import { Inspector } from "./components/Inspector";
import { ProjectPanel, type Panel } from "./components/ProjectPanel";
import { ToolRail } from "./components/ToolRail";
import { Welcome } from "./components/Welcome";
import { useCanvasEditor } from "./editor/useCanvasEditor";

const AUTO_SAVE_DELAY_KEY = "easy-svg-asset-auto-save-delay";

function readAutoSaveDelay() {
  const saved = localStorage.getItem(AUTO_SAVE_DELAY_KEY);
  if (saved === null) return 500;
  const value = Number(saved);
  return Number.isFinite(value)
    ? Math.min(10000, Math.max(100, Math.round(value)))
    : 500;
}

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [recent, setRecent] = useState<RecentFolder[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [library, setLibrary] = useState<LibraryShape[]>([]);
  const [fileName, setFileName] = useState("untitled.svg");
  const [openedName, setOpenedName] = useState<string | null>(null);
  const [autoSaveDelay, setAutoSaveDelay] = useState(readAutoSaveDelay);
  const [panel, setPanel] = useState<Panel>("layers");
  const editor = useCanvasEditor(project);

  useEffect(() => {
    localStorage.setItem(AUTO_SAVE_DELAY_KEY, String(autoSaveDelay));
  }, [autoSaveDelay]);

  useEffect(() => {
    void window.studio.recentFolders().then(setRecent);
    void window.studio.listLibrary().then(setLibrary);
  }, []);

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

  function saveProjectSettings(settings: ProjectSettings) {
    void window.studio
      .saveProjectSettings(settings)
      .catch((error) => window.alert(String(error)));
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
    const timer = window.setTimeout(() => void save(false), autoSaveDelay);
    return () => window.clearTimeout(timer);
  }, [editor.changeVersion, autoSaveDelay]);

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

  if (!project)
    return (
      <Welcome
        recent={recent}
        onOpenFolder={() => void openFolder()}
        onOpenRecent={(folder) => void openRecent(folder)}
      />
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
          autoSaveDelay={autoSaveDelay}
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
            });
          }}
          onGridSizeChange={(value) => {
            editor.setGridSize(value);
            saveProjectSettings({
              snapToGrid: editor.snapToGrid,
              gridSize: value,
            });
          }}
          onAutoSaveDelayChange={(value) =>
            Number.isFinite(value) &&
            setAutoSaveDelay(Math.min(10000, Math.max(100, Math.round(value))))
          }
        />
        <Inspector
          selected={editor.selected}
          fill={editor.fill}
          stroke={editor.stroke}
          radius={editor.radius}
          onRadiusChange={(value) => {
            editor.setRadius(value);
            editor.updateStyle("rx", value);
          }}
          onPositionChange={editor.updatePosition}
          onPaletteColor={(value, target) => {
            if (target === "fill") editor.setFill(value);
            else editor.setStroke(value);
            editor.updateStyle(target, value);
          }}
        />
      </div>
    </main>
  );
}
