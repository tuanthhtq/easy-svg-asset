import type { AiRequest, AiResponse } from "./ai";

export type Project = {
  name: string;
  root: string;
  manifest: string;
  activeDocument: string | null;
  snapToGrid: boolean;
  gridSize: number;
};
export type ProjectSettings = Pick<Project, "snapToGrid" | "gridSize">;
export type RecentFolder = { name: string; root: string; openedAt: string };
export type LibraryShape = { name: string; path: string; svg: string };
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
