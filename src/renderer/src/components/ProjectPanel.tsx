import { useState } from "react";
import { Group, type FabricObject } from "fabric";
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
import { isExpandableLayer, layerTreeRows } from "../editor/layers";
import { AppButton } from "./AppButton";

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
  const [expanded, setExpanded] = useState<Set<FabricObject>>(() => new Set());

  function labelFor(object: FabricObject) {
    return (
      (object as NamedObject).name ||
      (isFlattened(object)
        ? "Flattened"
        : object instanceof Group
          ? "Group"
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

  function toggleExpanded(object: FabricObject) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(object)) next.delete(object);
      else next.add(object);
      return next;
    });
  }

  return (
    <aside className="left-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Workspace</span>
          <strong>{project.name}</strong>
        </div>
        <AppButton
          className="icon-button"
          title="Open folder"
          aria-label="Open folder"
          onClick={onOpenFolder}
        >
          <FolderOpen />
        </AppButton>
      </div>
      <div className="project-path" title={project.root}>
        {project.root}
      </div>
      <div className="document-block">
        <div className="document-heading">
          <label htmlFor="open-svg">Document</label>
          <AppButton
            className="document-reload"
            title="Reload current SVG from disk"
            aria-label="Reload current SVG from disk"
            disabled={!documents.includes(fileName)}
            onClick={onReload}
          >
            <RefreshCw />
          </AppButton>
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
        <AppButton
          className={panel === "layers" ? "active" : ""}
          role="tab"
          aria-selected={panel === "layers"}
          onClick={() => onPanelChange("layers")}
        >
          <Layers3 /> Layers <span>{objects.length}</span>
        </AppButton>
        <AppButton
          className={panel === "library" ? "active" : ""}
          role="tab"
          aria-selected={panel === "library"}
          onClick={() => onPanelChange("library")}
        >
          <LibraryBig /> Library <span>{library.length}</span>
        </AppButton>
      </div>
      {panel === "layers" ? (
        <div className="layers" role="tree" aria-label="Layers">
          {layerTreeRows(objects, expanded).map(({ object, depth, path }) => {
            const expandable = isExpandableLayer(object);
            const open = expanded.has(object);
            return (
              <div
                className={selected === object ? "layer selected" : "layer"}
                key={path}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={expandable ? open : undefined}
                tabIndex={0}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                onClick={() => onSelectObject(object)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" && expandable && !open)
                    toggleExpanded(object);
                  else if (event.key === "ArrowLeft" && expandable && open)
                    toggleExpanded(object);
                  else if (event.key === "Enter" || event.key === " ")
                    onSelectObject(object);
                }}
                onDoubleClick={() => {
                  setEditing(object);
                  setDraftName(labelFor(object));
                }}
              >
                {expandable ? (
                  <AppButton
                    className="layer-toggle"
                    aria-label={open ? "Collapse group" : "Expand group"}
                    aria-expanded={open}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExpanded(object);
                    }}
                  >
                    {open ? "▾" : "▸"}
                  </AppButton>
                ) : (
                  <span className="layer-toggle-spacer" />
                )}
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
            );
          })}
          {!objects.length && <p className="empty-list">No shapes yet</p>}
        </div>
      ) : (
        <>
          <AppButton
            className="save-shape"
            onClick={onSaveShape}
            disabled={!selected}
          >
            <LibraryBig /> Save selection to library
          </AppButton>
          <div className="library-grid">
            {library.map((shape) => (
              <AppButton
                className="library-shape"
                key={shape.path}
                onClick={() => onUseShape(shape)}
              >
                <span dangerouslySetInnerHTML={{ __html: shape.svg }} />
                <small>{shape.name}</small>
              </AppButton>
            ))}
          </div>
        </>
      )}
      <div className="file-actions">
        <AppButton onClick={onNew}>
          <FilePlus2 /> New
        </AppButton>
        <AppButton onClick={onImport}>
          <Upload /> Import
        </AppButton>
        <AppButton className="primary-action" onClick={onExport}>
          Export PNG
        </AppButton>
      </div>
      <AppButton className="panel-save" onClick={onSave}>
        Save SVG
      </AppButton>
    </aside>
  );
}
