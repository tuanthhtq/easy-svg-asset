import {
  Circle,
  FolderOpen,
  MousePointer2,
  PenTool,
  Redo2,
  Square,
  Triangle,
  Undo2,
} from "lucide-react";
import type { Tool } from "../editor/useCanvasEditor";

type ToolRailProps = {
  tool: Tool;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenFolder: () => void;
};

export function ToolRail({
  tool,
  canUndo,
  canRedo,
  onSelectTool,
  onUndo,
  onRedo,
  onOpenFolder,
}: ToolRailProps) {
  return (
    <nav className="tool-rail" aria-label="Drawing tools">
      <button
        className={tool === "select" ? "rail-tool active" : "rail-tool"}
        title="Select"
        aria-label="Select"
        aria-pressed={tool === "select"}
        onClick={() => onSelectTool("select")}
      >
        <MousePointer2 />
      </button>
      <button
        className={tool === "pen" ? "rail-tool active" : "rail-tool"}
        title="Pen"
        aria-label="Pen"
        aria-pressed={tool === "pen"}
        onClick={() => onSelectTool("pen")}
      >
        <PenTool />
      </button>
      <button
        className={tool === "rect" ? "rail-tool active" : "rail-tool"}
        title="Rectangle"
        aria-label="Rectangle"
        aria-pressed={tool === "rect"}
        onClick={() => onSelectTool("rect")}
      >
        <Square />
      </button>
      <button
        className={tool === "ellipse" ? "rail-tool active" : "rail-tool"}
        title="Ellipse"
        aria-label="Ellipse"
        aria-pressed={tool === "ellipse"}
        onClick={() => onSelectTool("ellipse")}
      >
        <Circle />
      </button>
      <button
        className={tool === "triangle" ? "rail-tool active" : "rail-tool"}
        title="Triangle"
        aria-label="Triangle"
        aria-pressed={tool === "triangle"}
        onClick={() => onSelectTool("triangle")}
      >
        <Triangle />
      </button>
      <div className="rail-spacer" />
      <button
        className="rail-tool"
        title="Undo"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 />
      </button>
      <button
        className="rail-tool"
        title="Redo"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 />
      </button>
      <button
        className="rail-tool"
        title="Open another folder"
        aria-label="Open another folder"
        onClick={onOpenFolder}
      >
        <FolderOpen />
      </button>
    </nav>
  );
}
