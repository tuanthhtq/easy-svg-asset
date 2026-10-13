import { useState } from "react";
import type { FabricObject } from "fabric";
import {
  FilePlus2,
  FolderOpen,
  Layers3,
  LibraryBig,
  RefreshCw,
  Upload,
} from "lucide-react";
import type { LibraryShape, Project } from "../../../shared/types";
import { isFlattened } from "../editor/flatten";

type NamedObject = FabricObject & { name?: string };

export type Panel = "layers" | "library";

type ProjectPanelProps = {
  project: Project;
  documents: string[];
  library: LibraryShape[];
  fileName: string;
  panel: Panel;
  objects: FabricObject[];
  selected: FabricObject | null;
  onFileNameChange: (name: string) => void;
  onOpenFolder: () => void;
  onLoadFile: (name: string) => void;
  onReload: () => void;
  onPanelChange: (panel: Panel) => void;
  onSelectObject: (object: FabricObject) => void;
  onRenameObject: (object: FabricObject, name?: string) => void;
  onSaveShape: () => void;
  onUseShape: (shape: LibraryShape) => void;
  onNew: () => void;
  onImport: () => void;
  onSave: () => void;
  onExport: () => void;
};

export function ProjectPanel({
  project,
  documents,
  library,
  fileName,
  panel,
  objects,
  selected,
  onFileNameChange,
  onOpenFolder,
  onLoadFile,
  onReload,
  onPanelChange,
  onSelectObject,
  onRenameObject,
  onSaveShape,
  onUseShape,
  onNew,
  onImport,
  onSave,
  onExport,
}: ProjectPanelProps) {
  const [editing, setEditing] = useState<FabricObject | null>(null);
  const [draftName, setDraftName] = useState("");

  function labelFor(object: FabricObject) {
    return (
      (object as NamedObject).name ||
      (isFlattened(object)
        ? "Flattened"
        : object.type === "rect"
          ? "Rectangle"
          : object.type === "ellipse"
            ? "Ellipse"
            : object.type)
    );
  }

  function finishRename() {
    if (editing && draftName.trim()) onRenameObject(editing, draftName.trim());
    setEditing(null);
  }

  return (
    <aside className="left-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Workspace</span>
          <strong>{project.name}</strong>
        </div>
        <button
          className="icon-button"
          title="Open folder"
          aria-label="Open folder"
          onClick={onOpenFolder}
        >
          <FolderOpen />
        </button>
      </div>
      <div className="project-path" title={project.root}>
        {project.root}
      </div>
      <div className="document-block">
        <div className="document-heading">
          <label htmlFor="open-svg">Document</label>
          <button
            className="document-reload"
            title="Reload current SVG from disk"
            aria-label="Reload current SVG from disk"
            disabled={!documents.includes(fileName)}
            onClick={onReload}
          >
            <RefreshCw />
          </button>
        </div>
        <select
          id="open-svg"
          aria-label="Open SVG"
          value={fileName}
          onChange={(event) => onLoadFile(event.target.value)}
        >
          {documents.map((name) => (
            <option key={name}>{name}</option>
          ))}
          {!documents.includes(fileName) && <option>{fileName}</option>}
        </select>
        <input
          aria-label="SVG filename"
          value={fileName}
          onChange={(event) => onFileNameChange(event.target.value)}
        />
      </div>
      <div className="panel-tabs" role="tablist">
        <button
          className={panel === "layers" ? "active" : ""}
          role="tab"
          aria-selected={panel === "layers"}
          onClick={() => onPanelChange("layers")}
        >
          <Layers3 /> Layers <span>{objects.length}</span>
        </button>
        <button
          className={panel === "library" ? "active" : ""}
          role="tab"
          aria-selected={panel === "library"}
          onClick={() => onPanelChange("library")}
        >
          <LibraryBig /> Library <span>{library.length}</span>
        </button>
      </div>
      {panel === "layers" ? (
        <div className="layers">
          {[...objects].reverse().map((object, index) => (
            <div
              className={selected === object ? "layer selected" : "layer"}
              key={`${object.type}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectObject(object)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  onSelectObject(object);
              }}
              onDoubleClick={() => {
                setEditing(object);
                setDraftName(labelFor(object));
              }}
            >
              <span className={`layer-dot ${object.type}`} />
              {editing === object ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                labelFor(object)
              )}
            </div>
          ))}
          {!objects.length && <p className="empty-list">No shapes yet</p>}
        </div>
      ) : (
        <>
          <button
            className="save-shape"
            onClick={onSaveShape}
            disabled={!selected}
          >
            <LibraryBig /> Save selection to library
          </button>
          <div className="library-grid">
            {library.map((shape) => (
              <button
                className="library-shape"
                key={shape.path}
                onClick={() => onUseShape(shape)}
              >
                <span dangerouslySetInnerHTML={{ __html: shape.svg }} />
                <small>{shape.name}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="file-actions">
        <button onClick={onNew}>
          <FilePlus2 /> New
        </button>
        <button onClick={onImport}>
          <Upload /> Import
        </button>
        <button className="primary-action" onClick={onExport}>
          Export PNG
        </button>
      </div>
      <button className="panel-save" onClick={onSave}>
        Save SVG
      </button>
    </aside>
  );
}
