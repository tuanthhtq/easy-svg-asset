import type { ReactNode, RefObject } from "react";
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
import { AppInput } from "./AppInput";
import { AppButton } from "./AppButton";

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
  overlay?: ReactNode;
  onLayer: (action: LayerAction) => void;
  onCloseContextMenu: () => void;
  onGroup: () => void;
  onFlatten: () => void;
  onUngroup: () => void;
  onZoom: (zoom: number) => void;
  onSnapChange: (value: boolean) => void;
  onGridSizeChange: (value: number) => void;
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
  overlay,
  onLayer,
  onCloseContextMenu,
  onGroup,
  onFlatten,
  onUngroup,
  onZoom,
  onSnapChange,
  onGridSizeChange,
}: EditorStageProps) {
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
            <AppInput
              label="Grid"
              value={gridSize}
              fallback={2}
              min={1}
              integer
              onCommit={onGridSizeChange}
            />
          )}
        </div>
      </header>
      {hasSelection && (
        <div className="object-actions" aria-label="Selection actions">
          <AppButton
            title="Lower"
            aria-label="Lower"
            onClick={() => onLayer("down")}
          >
            <ArrowDown />
          </AppButton>
          <AppButton
            title="Raise"
            aria-label="Raise"
            onClick={() => onLayer("up")}
          >
            <ArrowUp />
          </AppButton>
          <AppButton title="Group" aria-label="Group" onClick={onGroup}>
            <Group />
          </AppButton>
          <AppButton
            title="Flatten"
            aria-label="Flatten"
            disabled={!canFlatten}
            onClick={onFlatten}
          >
            <Combine />
          </AppButton>
          <AppButton
            title="Ungroup"
            aria-label="Ungroup"
            disabled={!canUngroup}
            onClick={onUngroup}
          >
            <Ungroup />
          </AppButton>
        </div>
      )}
      {contextMenu && (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onMouseLeave={onCloseContextMenu}
        >
          <AppButton
            role="menuitem"
            disabled={!canGroup}
            onClick={() => {
              onGroup();
              onCloseContextMenu();
            }}
          >
            Group
          </AppButton>
          <AppButton
            role="menuitem"
            disabled={!canFlatten}
            onClick={() => {
              onFlatten();
              onCloseContextMenu();
            }}
          >
            Flatten
          </AppButton>
          <AppButton
            role="menuitem"
            disabled={!canUngroup}
            onClick={() => {
              onUngroup();
              onCloseContextMenu();
            }}
          >
            Ungroup
          </AppButton>
          <AppButton
            role="menuitem"
            onClick={() => {
              onLayer("up");
              onCloseContextMenu();
            }}
          >
            Bring forward
          </AppButton>
          <AppButton
            role="menuitem"
            onClick={() => {
              onLayer("front");
              onCloseContextMenu();
            }}
          >
            Bring to front
          </AppButton>
          <AppButton
            role="menuitem"
            onClick={() => {
              onLayer("down");
              onCloseContextMenu();
            }}
          >
            Send backward
          </AppButton>
          <AppButton
            role="menuitem"
            onClick={() => {
              onLayer("back");
              onCloseContextMenu();
            }}
          >
            Send to back
          </AppButton>
        </div>
      )}
      <div className="canvas-stage">
        <div className="canvas-viewport" ref={stageRef}>
          <canvas ref={canvasEl} />
        </div>
      </div>
      <div className="zoom-control" aria-label="Zoom controls">
        <AppButton
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => onZoom(zoom - 0.1)}
        >
          <Minus />
        </AppButton>
        <span>{Math.round(zoom * 100)}%</span>
        <AppButton
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => onZoom(zoom + 0.1)}
        >
          <Plus />
        </AppButton>
      </div>
      {overlay}
    </section>
  );
}
