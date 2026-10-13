import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import {
  basename,
  extname,
  join,
  resolve,
  relative,
  isAbsolute,
  sep,
} from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  ensureProject,
  setActiveDocument,
  setProjectSettings,
} from "../shared/project";
import { validateSvg } from "../shared/svg";
import type {
  LibraryShape,
  Project,
  ProjectSettings,
  RecentFolder,
} from "../shared/types";

let activeRoot: string | null = null;
let activeProject: Project | null = null;
const dataRoot = () => join(app.getPath("userData"), "library");
const recentPath = () => join(app.getPath("userData"), "recent.json");
function inside(root: string, file: string) {
  const part = relative(root, file);
  return (
    Boolean(part) &&
    part !== ".." &&
    !part.startsWith(`..${sep}`) &&
    !isAbsolute(part)
  );
}
async function recent(): Promise<RecentFolder[]> {
  try {
    const value: unknown = JSON.parse(await readFile(recentPath(), "utf8"));
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is RecentFolder =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as RecentFolder).name === "string" &&
              typeof (item as RecentFolder).root === "string" &&
              typeof (item as RecentFolder).openedAt === "string",
          )
          .slice(0, 12)
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
async function remember(project: Project) {
  const list = [
    {
      name: project.name,
      root: project.root,
      openedAt: new Date().toISOString(),
    },
    ...(await recent()).filter((item) => item.root !== project.root),
  ].slice(0, 12);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(recentPath(), JSON.stringify(list, null, 2));
  return list;
}
function root() {
  if (!activeRoot) throw new Error("Open a folder first");
  return activeRoot;
}
async function documentNames() {
  return (await readdir(root(), { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".svg",
    )
    .map((entry) => entry.name);
}
async function safeDocument(name: string, mustExist = false) {
  if (typeof name !== "string" || !/^[^\\/:*?"<>|]+\.svg$/i.test(name))
    throw new Error("Invalid SVG filename");
  const target = resolve(root(), name);
  if (!inside(root(), target)) throw new Error("SVG path escapes folder");
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("SVG must be a regular file");
    if (!inside(root(), await realpath(target)))
      throw new Error("SVG resolves outside folder");
  } catch (error) {
    if (mustExist || (error as NodeJS.ErrnoException).code !== "ENOENT")
      throw error;
  }
  return target;
}
async function atomicWrite(path: string, data: string | Uint8Array) {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, data, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
async function uniqueDocumentName(name: string) {
  const stem = basename(name, ".svg");
  let candidate = name,
    index = 2;
  while ((await documentNames()).includes(candidate))
    candidate = `${stem}-${index++}.svg`;
  return candidate;
}
async function safeLibraryPath(nameOrPath: string) {
  const dir = dataRoot(),
    target = resolve(dir, nameOrPath);
  if (!inside(dir, target)) throw new Error("Invalid library path");
  try {
    const info = await lstat(target);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      !inside(dir, await realpath(target))
    )
      throw new Error("Library shape must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}
async function library(): Promise<LibraryShape[]> {
  const dir = dataRoot();
  await mkdir(dir, { recursive: true });
  const files = await readdir(dir, { withFileTypes: true });
  return Promise.all(
    files
      .filter((file) => file.isFile() && file.name.endsWith(".svg"))
      .map(async (file) => {
        const path = await safeLibraryPath(file.name);
        return {
          name: basename(file.name, ".svg"),
          path,
          svg: validateSvg(await readFile(path, "utf8")),
        };
      }),
  );
}
async function activate(path: string) {
  const project = await ensureProject(await realpath(path));
  activeRoot = project.root;
  activeProject = project;
  await remember(project);
  return project;
}
function registerIpc() {
  ipcMain.handle("project:open", async () => {
    const picked = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return picked.canceled || !picked.filePaths[0]
      ? null
      : activate(picked.filePaths[0]);
  });
  ipcMain.handle("project:open-recent", async (_, path: unknown) => {
    if (
      typeof path !== "string" ||
      !(await recent()).some((item) => item.root === path)
    )
      throw new Error("Folder is not in recent list");
    return activate(path);
  });
  ipcMain.handle("project:recent", () => recent());
  ipcMain.handle("project:settings", async (_, value: unknown) => {
    if (!activeProject || !value || typeof value !== "object")
      throw new Error("No active project");
    const project = activeProject;
    const settings = value as Partial<ProjectSettings>;
    if (
      typeof settings.snapToGrid !== "boolean" ||
      typeof settings.gridSize !== "number" ||
      !Number.isInteger(settings.gridSize) ||
      settings.gridSize <= 0
    )
      throw new Error("Invalid project settings");
    const next = await setProjectSettings(project, {
      snapToGrid: settings.snapToGrid,
      gridSize: settings.gridSize,
    });
    if (activeProject?.root === project.root) activeProject = next;
    return next;
  });
  ipcMain.handle("document:list", () => documentNames());
  ipcMain.handle("document:load", async (_, name: unknown) => {
    const target = await safeDocument(name as string, true);
    if (activeProject)
      activeProject = await setActiveDocument(activeProject, basename(target));
    return validateSvg(await readFile(target, "utf8"));
  });
  ipcMain.handle("document:save", async (_, name: unknown, svg: unknown) => {
    const target = await safeDocument(name as string);
    await atomicWrite(target, validateSvg(svg));
    if (activeProject)
      activeProject = await setActiveDocument(activeProject, basename(target));
    return basename(target);
  });
  ipcMain.handle("document:import", async () => {
    const picked = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "SVG", extensions: ["svg"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const source = picked.filePaths[0],
      svg = validateSvg(await readFile(source, "utf8")),
      name = await uniqueDocumentName(basename(source));
    await copyFile(source, await safeDocument(name), constants.COPYFILE_EXCL);
    return { name, svg };
  });
  ipcMain.handle("document:png", async (_, name: unknown, svg: unknown) => {
    const source = validateSvg(svg),
      picked = await dialog.showSaveDialog({
        defaultPath: join(root(), `${String(name).replace(/\.svg$/i, "")}.png`),
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
    if (picked.canceled || !picked.filePath) return "";
    const image = new Resvg(source, { background: "transparent" });
    if (
      image.width > 4096 ||
      image.height > 4096 ||
      image.width * image.height > 16_777_216
    )
      throw new Error("SVG dimensions are too large");
    await atomicWrite(picked.filePath, image.render().asPng());
    return picked.filePath;
  });
  ipcMain.handle("library:list", () => library());
  ipcMain.handle("library:save", async (_, name: unknown, svg: unknown) => {
    if (typeof name !== "string" || !/^[\w .-]{1,80}$/.test(name))
      throw new Error("Invalid library shape");
    await mkdir(dataRoot(), { recursive: true });
    await atomicWrite(
      await safeLibraryPath(`${name.replace(/\.svg$/i, "")}.svg`),
      validateSvg(svg),
    );
    return library();
  });
  ipcMain.handle("library:use", async (_, path: unknown) => {
    if (typeof path !== "string") throw new Error("Invalid library path");
    const target = await safeLibraryPath(path);
    return validateSvg(await readFile(target, "utf8"));
  });
}
function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.removeMenu();
  if (process.env.ELECTRON_RENDERER_URL)
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}
app.whenReady().then(() => {
  registerIpc();
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
