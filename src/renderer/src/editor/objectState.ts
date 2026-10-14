import { FabricObject, Group } from "fabric";

export function configureGroupInteraction(group: Group, editable: boolean) {
  group.set({ subTargetCheck: editable, interactive: false });
  return group;
}

export function setAiPreviewState(object: FabricObject, preview: boolean) {
  object.set({
    excludeFromExport: preview,
    selectable: !preview,
    evented: !preview,
    opacity: preview ? 0.72 : 1,
  });
  return object;
}
