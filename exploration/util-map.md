# Utilities

`src/shared/project.ts` creates or validates `.easy-svg-asset/project.json` and atomically records the active document. `src/shared/svg.ts` rejects oversized SVG and active content. `src/renderer/src/editor/history.ts` provides branch-aware undo/redo state, and `useCanvasEditor.ts` contains Fabric canvas operations. Main-process path checks require regular files inside the active folder or global Library.
