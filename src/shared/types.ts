import type { AiImage, AiRequest, AiResponse } from "./ai";

export type Project = {
  name: string;
  root: string;
  manifest: string;
  activeDocument: string | null;
  snapToGrid: boolean;
  gridSize: number;
  activeAiStylePresetId: string | null;
};
export type ProjectSettings = Pick<
  Project,
  "snapToGrid" | "gridSize" | "activeAiStylePresetId"
>;
export type RecentFolder = { name: string; root: string; openedAt: string };
export type LibraryShape = { name: string; path: string; svg: string };
export type AiStyleView =
  "orthographic_top_down" | "three_quarter_top_down" | "isometric" | "freeform";
export type AiStylePreset = {
  id: string;
  name: string;
  isDefault: boolean;
  instruction: string;
  terrainView: AiStyleView;
  propView: AiStyleView;
  buildingView: AiStyleView;
  noVisibleSideFacesForTerrain: boolean;
  detailLevel: "minimal" | "moderate" | "rich";
  referenceImages: Array<{
    id: string;
    name: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
  }>;
};
export const DEFAULT_AI_STYLE_PRESET: AiStylePreset = {
  id: "default-game-assets",
  name: "Game Assets",
  isDefault: true,
  instruction:
    "Readable game assets with a consistent silhouette and minimal detail.",
  terrainView: "orthographic_top_down",
  propView: "three_quarter_top_down",
  buildingView: "three_quarter_top_down",
  noVisibleSideFacesForTerrain: true,
  detailLevel: "minimal",
  referenceImages: [],
};
export const AI_REASONING_EFFORTS = [
  "auto",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;
export type AiReasoningEffort = (typeof AI_REASONING_EFFORTS)[number];
export function isAiReasoningEffort(
  value: unknown,
): value is AiReasoningEffort {
  return AI_REASONING_EFFORTS.includes(value as AiReasoningEffort);
}
export type AppSettings = {
  autoSaveDelay: number;
  aiApiUrl: string;
  aiModel: string;
  aiReasoningEffort: AiReasoningEffort;
  hasAiSecret: boolean;
};
export type AppSettingsInput = Omit<AppSettings, "hasAiSecret"> & {
  aiSecret?: string;
};

export type StudioApi = {
  openFolder: () => Promise<Project | null>;
  openRecent: (root: string) => Promise<Project>;
  saveProjectSettings: (settings: ProjectSettings) => Promise<Project>;
  listAiStylePresets: () => Promise<AiStylePreset[]>;
  saveAiStylePreset: (preset: AiStylePreset) => Promise<AiStylePreset[]>;
  duplicateAiStylePreset: (id: string) => Promise<AiStylePreset[]>;
  deleteAiStylePreset: (id: string) => Promise<AiStylePreset[]>;
  addAiStyleReference: (
    presetId: string,
    name: string,
    image: AiImage,
  ) => Promise<AiStylePreset[]>;
  removeAiStyleReference: (
    presetId: string,
    referenceId: string,
  ) => Promise<AiStylePreset[]>;
  loadAiStyleReference: (
    presetId: string,
    referenceId: string,
  ) => Promise<AiImage>;
  recentFolders: () => Promise<RecentFolder[]>;
  listDocuments: () => Promise<string[]>;
  loadDocument: (name: string) => Promise<string>;
  saveDocument: (name: string, svg: string) => Promise<string>;
  importSvg: () => Promise<{ name: string; svg: string } | null>;
  exportPng: (name: string, svg: string) => Promise<string>;
  listLibrary: () => Promise<LibraryShape[]>;
  saveLibraryShape: (name: string, svg: string) => Promise<LibraryShape[]>;
  useLibraryShape: (path: string) => Promise<string>;
  getAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (settings: AppSettingsInput) => Promise<AppSettings>;
  runAi: (request: AiRequest) => Promise<AiResponse>;
};
