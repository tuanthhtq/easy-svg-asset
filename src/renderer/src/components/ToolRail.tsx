import {
  Circle,
  FolderOpen,
  MousePointer2,
  PenTool,
  Redo2,
  Settings,
  Square,
  Triangle,
  Undo2,
} from "lucide-react";
import type { Tool } from "../editor/useCanvasEditor";
import { AppButton } from "./AppButton";

type ToolRailProps = {
  tool: Tool;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
};

export function ToolRail({
  tool,
  canUndo,
  canRedo,
  onSelectTool,
  onUndo,
  onRedo,
  onOpenFolder,
  onOpenSettings,
}: ToolRailProps) {
  return (
    <nav className="tool-rail" aria-label="Drawing tools">
      <AppButton
        className={tool === "select" ? "rail-tool active" : "rail-tool"}
        title="Select"
        aria-label="Select"
        aria-pressed={tool === "select"}
        onClick={() => onSelectTool("select")}
      >
        <MousePointer2 />
      </AppButton>
      <AppButton
        className={tool === "pen" ? "rail-tool active" : "rail-tool"}
        title="Pen"
        aria-label="Pen"
        aria-pressed={tool === "pen"}
        onClick={() => onSelectTool("pen")}
      >
        <PenTool />
      </AppButton>
      <AppButton
        className={tool === "rect" ? "rail-tool active" : "rail-tool"}
        title="Rectangle"
        aria-label="Rectangle"
        aria-pressed={tool === "rect"}
        onClick={() => onSelectTool("rect")}
      >
        <Square />
      </AppButton>
      <AppButton
        className={tool === "ellipse" ? "rail-tool active" : "rail-tool"}
        title="Ellipse"
        aria-label="Ellipse"
        aria-pressed={tool === "ellipse"}
        onClick={() => onSelectTool("ellipse")}
      >
        <Circle />
      </AppButton>
      <AppButton
        className={tool === "triangle" ? "rail-tool active" : "rail-tool"}
        title="Triangle"
        aria-label="Triangle"
        aria-pressed={tool === "triangle"}
        onClick={() => onSelectTool("triangle")}
      >
        <Triangle />
      </AppButton>
      <div className="rail-spacer" />
      <AppButton
        className="rail-tool"
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        <Settings />
      </AppButton>
      <AppButton
        className="rail-tool"
        title="Undo"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 />
      </AppButton>
      <AppButton
        className="rail-tool"
        title="Redo"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 />
      </AppButton>
      <AppButton
        className="rail-tool"
        title="Open another folder"
        aria-label="Open another folder"
        onClick={onOpenFolder}
      >
        <FolderOpen />
      </AppButton>
    </nav>
  );
}
