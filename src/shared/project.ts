import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { Project, ProjectSettings } from "./types";

export const manifestDir = ".easy-svg-asset";
export const manifestName = "project.json";
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  snapToGrid: false,
  gridSize: 2,
};
let projectWrites = Promise.resolve();
export function projectManifest(root: string) {
  return join(root, manifestDir, manifestName);
}
export async function ensureProject(root: string): Promise<Project> {
  root = resolve(root);
  const name = basename(root) || root;
  const manifest = projectManifest(root);
  await mkdir(join(root, manifestDir), { recursive: true });
  try {
    const value = JSON.parse(
      await readFile(manifest, "utf8"),
    ) as Partial<Project>;
    if (
      resolve(value.root ?? "") !== root ||
      value.name !== name ||
      (value.activeDocument !== null &&
        typeof value.activeDocument !== "string")
    )
      throw new Error("Invalid easy-svg-asset manifest");
    const project = {
      name,
      root,
      manifest,
      activeDocument: value.activeDocument ?? null,
      snapToGrid:
        typeof value.snapToGrid === "boolean"
          ? value.snapToGrid
          : DEFAULT_PROJECT_SETTINGS.snapToGrid,
      gridSize:
        typeof value.gridSize === "number" &&
        Number.isInteger(value.gridSize) &&
        value.gridSize > 0
          ? value.gridSize
          : DEFAULT_PROJECT_SETTINGS.gridSize,
    };
    if (
      value.snapToGrid !== project.snapToGrid ||
      value.gridSize !== project.gridSize
    )
      await writeFile(manifest, JSON.stringify(project, null, 2));
    return project;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(
      manifest,
      JSON.stringify(
        {
          name,
          root,
          manifest,
          activeDocument: null,
          ...DEFAULT_PROJECT_SETTINGS,
        },
        null,
        2,
      ),
    );
  }
  return {
    name,
    root,
    manifest,
    activeDocument: null,
    ...DEFAULT_PROJECT_SETTINGS,
  };
}
export async function setActiveDocument(
  project: Project,
  activeDocument: string,
) {
  return updateProject(project, { activeDocument });
}

export async function setProjectSettings(
  project: Project,
  settings: ProjectSettings,
) {
  return updateProject(project, settings);
}

function updateProject(project: Project, patch: Partial<Project>) {
  const update = projectWrites.then(async () => {
    const current = await ensureProject(project.root);
    const next = { ...current, ...patch };
    const temporary = `${project.manifest}.tmp`;
    await writeFile(temporary, JSON.stringify(next, null, 2));
    await rename(temporary, project.manifest);
    return next;
  });
  projectWrites = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}
