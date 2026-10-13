import { useEffect, useState, type RefObject } from "react";
import type { ContextMenu, LayerAction } from "../editor/useCanvasEditor";
import {
  ArrowDown,
  ArrowUp,
  Combine,
  Group,
  Minus,
  Plus,
  Ungroup,
} from "lucide-react";

type EditorStageProps = {
  canvasEl: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  fileName: string;
  hasSelection: boolean;
  contextMenu: ContextMenu;
  canGroup: boolean;
  canFlatten: boolean;
  canUngroup: boolean;
  zoom: number;
  snapToGrid: boolean;
  gridSize: number;
  autoSaveDelay: number;
  onLayer: (action: LayerAction) => void;
  onCloseContextMenu: () => void;
  onGroup: () => void;
  onFlatten: () => void;
  onUngroup: () => void;
  onZoom: (zoom: number) => void;
  onSnapChange: (value: boolean) => void;
  onGridSizeChange: (value: number) => void;
  onAutoSaveDelayChange: (value: number) => void;
};

export function EditorStage({
  canvasEl,
  stageRef,
  fileName,
  hasSelection,
  contextMenu,
  canGroup,
  canFlatten,
  canUngroup,
  zoom,
  snapToGrid,
  gridSize,
  autoSaveDelay,
  onLayer,
  onCloseContextMenu,
  onGroup,
  onFlatten,
  onUngroup,
  onZoom,
  onSnapChange,
  onGridSizeChange,
  onAutoSaveDelayChange,
}: EditorStageProps) {
  const [gridDraft, setGridDraft] = useState(String(gridSize));

  useEffect(() => setGridDraft(String(gridSize)), [gridSize]);

  function commitGridSize() {
    const value = Math.round(Number(gridDraft));
    const next = Number.isFinite(value) && value > 0 ? value : 2;
    setGridDraft(String(next));
    onGridSizeChange(next);
  }

  return (
    <section className="stage-wrap">
      <header className="canvas-header">
        <div className="file-title">
          <span className="file-kicker">Editing</span>
          <strong>{fileName}</strong>
        </div>
        <div className="canvas-controls">
          <label className="canvas-snap">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(event) => onSnapChange(event.target.checked)}
            />
            <span>Snap</span>
          </label>
          {snapToGrid && (
            <label>
              <span>Grid</span>
              <input
                type="number"
                value={gridDraft}
                onChange={(event) => setGridDraft(event.target.value)}
                onBlur={commitGridSize}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          )}
          <label>
            <span>Auto-save</span>
            <input
              type="number"
              min="100"
              max="10000"
              step="100"
              value={autoSaveDelay}
              onChange={(event) =>
                onAutoSaveDelayChange(Number(event.target.value))
              }
            />
          </label>
        </div>
      </header>
      {hasSelection && (
        <div className="object-actions" aria-label="Selection actions">
          <button
            title="Lower"
            aria-label="Lower"
            onClick={() => onLayer("down")}
          >
            <ArrowDown />
          </button>
          <button
            title="Raise"
            aria-label="Raise"
            onClick={() => onLayer("up")}
          >
            <ArrowUp />
          </button>
          <button title="Group" aria-label="Group" onClick={onGroup}>
            <Group />
          </button>
          <button
            title="Flatten"
            aria-label="Flatten"
            disabled={!canFlatten}
            onClick={onFlatten}
          >
            <Combine />
          </button>
          <button
            title="Ungroup"
            aria-label="Ungroup"
            disabled={!canUngroup}
            onClick={onUngroup}
          >
            <Ungroup />
          </button>
        </div>
      )}
      {contextMenu && (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onMouseLeave={onCloseContextMenu}
        >
          <button
            role="menuitem"
            disabled={!canGroup}
            onClick={() => {
              onGroup();
              onCloseContextMenu();
            }}
          >
            Group
          </button>
          <button
            role="menuitem"
            disabled={!canFlatten}
            onClick={() => {
              onFlatten();
              onCloseContextMenu();
            }}
          >
            Flatten
          </button>
          <button
            role="menuitem"
            disabled={!canUngroup}
            onClick={() => {
              onUngroup();
              onCloseContextMenu();
            }}
          >
            Ungroup
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onLayer("up");
              onCloseContextMenu();
            }}
          >
            Bring forward
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onLayer("front");
              onCloseContextMenu();
            }}
          >
            Bring to front
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onLayer("down");
              onCloseContextMenu();
            }}
          >
            Send backward
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onLayer("back");
              onCloseContextMenu();
            }}
          >
            Send to back
          </button>
        </div>
      )}
      <div className="canvas-stage">
        <div className="canvas-viewport" ref={stageRef}>
          <canvas ref={canvasEl} />
        </div>
      </div>
      <div className="zoom-control" aria-label="Zoom controls">
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => onZoom(zoom - 0.1)}
        >
          <Minus />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => onZoom(zoom + 0.1)}
        >
          <Plus />
        </button>
      </div>
    </section>
  );
}
