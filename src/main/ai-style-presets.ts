import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { AiImage } from "../shared/ai";
import {
  DEFAULT_AI_STYLE_PRESET,
  type AiStylePreset,
  type AiStyleView,
} from "../shared/types.ts";

const MAX_REFERENCES = 3;
const MAX_REFERENCE_BYTES = 5_000_000;
const MAX_TOTAL_REFERENCE_BYTES = 5_000_000;
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_PRESET = DEFAULT_AI_STYLE_PRESET;

type StoredPreset = Omit<AiStylePreset, "referenceImages"> & {
  referenceImages: AiStylePreset["referenceImages"];
};

let writes = Promise.resolve();

function root(userData: string) {
  return join(userData, "ai-style-presets");
}

function metadataPath(userData: string) {
  return join(root(userData), "presets.json");
}

function referencePath(
  userData: string,
  presetId: string,
  referenceId: string,
) {
  return join(root(userData), presetId, referenceId);
}

function validView(value: unknown): value is AiStyleView {
  return (
    value === "orthographic_top_down" ||
    value === "three_quarter_top_down" ||
    value === "isometric" ||
    value === "freeform"
  );
}

function validPreset(value: unknown): value is StoredPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<StoredPreset>;
  return (
    typeof preset.id === "string" &&
    /^[a-z0-9-]{1,80}$/.test(preset.id) &&
    typeof preset.name === "string" &&
    preset.name.trim().length > 0 &&
    preset.name.length <= 80 &&
    typeof preset.instruction === "string" &&
    preset.instruction.length <= 4000 &&
    validView(preset.terrainView) &&
    validView(preset.propView) &&
    validView(preset.buildingView) &&
    typeof preset.noVisibleSideFacesForTerrain === "boolean" &&
    (preset.detailLevel === "minimal" ||
      preset.detailLevel === "moderate" ||
      preset.detailLevel === "rich") &&
    Array.isArray(preset.referenceImages) &&
    preset.referenceImages.length <= MAX_REFERENCES &&
    preset.referenceImages.every(
      (reference) =>
        Boolean(reference) &&
        typeof reference.id === "string" &&
        /^[a-z0-9-]{1,80}$/.test(reference.id) &&
        typeof reference.name === "string" &&
        reference.name.length <= 120 &&
        MIME_TYPES.has(reference.mimeType),
    )
  );
}

async function readPresets(userData: string) {
  try {
    const value: unknown = JSON.parse(
      await readFile(metadataPath(userData), "utf8"),
    );
    if (!Array.isArray(value)) return [DEFAULT_PRESET];
    const presets = value.filter(validPreset);
    return presets.length ? presets : [DEFAULT_PRESET];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return [DEFAULT_PRESET];
    throw error;
  }
}

async function writePresets(userData: string, presets: StoredPreset[]) {
  await mkdir(root(userData), { recursive: true });
  const path = metadataPath(userData);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(presets, null, 2), { flag: "w" });
  await rename(temporary, path);
}

export async function listAiStylePresets(userData: string) {
  return readPresets(userData).then((presets) =>
    presets.map(({ referenceImages, ...preset }) => ({
      ...preset,
      referenceImages,
    })),
  );
}

export async function saveAiStylePreset(userData: string, value: unknown) {
  if (!validPreset(value)) throw new Error("Invalid AI style preset");
  const preset = { ...value, name: value.name.trim() };
  const update = writes.then(async () => {
    const presets = await readPresets(userData);
    const current = presets.find((item) => item.id === preset.id);
    if (!current && preset.referenceImages.length)
      throw new Error("New AI style presets cannot reference missing images");
    const saved = {
      ...preset,
      referenceImages: current?.referenceImages ?? [],
    };
    const next = current
      ? presets.map((item) => (item.id === saved.id ? saved : item))
      : [...presets, saved];
    await writePresets(userData, next);
    return next;
  });
  writes = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export async function duplicateAiStylePreset(userData: string, id: string) {
  const update = writes.then(async () => {
    const presets = await readPresets(userData);
    const source = presets.find((preset) => preset.id === id);
    if (!source) throw new Error("AI style preset not found");
    const copy: StoredPreset = {
      ...source,
      id: `preset-${randomUUID()}`,
      name: `${source.name} Copy`,
      referenceImages: source.referenceImages.map((reference) => ({
        ...reference,
      })),
    };
    for (const reference of source.referenceImages) {
      await mkdir(join(root(userData), copy.id), { recursive: true });
      await writeFile(
        referencePath(userData, copy.id, reference.id),
        await readFile(referencePath(userData, source.id, reference.id)),
      );
    }
    await writePresets(userData, [...presets, copy]);
    return [...presets, copy];
  });
  writes = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export async function deleteAiStylePreset(userData: string, id: string) {
  if (id === DEFAULT_PRESET.id)
    throw new Error("Default AI style preset cannot be deleted");
  const update = writes.then(async () => {
    const presets = await readPresets(userData);
    if (!presets.some((preset) => preset.id === id))
      throw new Error("AI style preset not found");
    const next = presets.filter((preset) => preset.id !== id);
    await writePresets(userData, next);
    await rm(join(root(userData), id), { recursive: true, force: true });
    return next;
  });
  writes = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export async function addAiStyleReference(
  userData: string,
  presetId: string,
  name: string,
  image: AiImage,
) {
  if (!MIME_TYPES.has(image.mimeType))
    throw new Error("Invalid AI style reference type");
  if (!/^[\w .-]{1,120}$/.test(name))
    throw new Error("Invalid AI style reference name");
  if (!/^[\w+/]*={0,2}$/.test(image.data))
    throw new Error("Invalid AI style reference data");
  if (Buffer.byteLength(image.data, "base64") > MAX_REFERENCE_BYTES)
    throw new Error("AI style reference exceeds 5 MB");
  const update = writes.then(async () => {
    const presets = await readPresets(userData);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) throw new Error("AI style preset not found");
    if (preset.referenceImages.length >= MAX_REFERENCES)
      throw new Error("AI style preset supports up to 3 reference images");
    let total = 0;
    for (const reference of preset.referenceImages) {
      total += Buffer.byteLength(
        await readFile(referencePath(userData, preset.id, reference.id)),
      );
    }
    if (
      total + Buffer.byteLength(image.data, "base64") >
      MAX_TOTAL_REFERENCE_BYTES
    )
      throw new Error("AI style preset references exceed 5 MB");
    const reference: AiStylePreset["referenceImages"][number] = {
      id: `reference-${randomUUID()}`,
      name,
      mimeType:
        image.mimeType as AiStylePreset["referenceImages"][number]["mimeType"],
    };
    await mkdir(join(root(userData), preset.id), { recursive: true });
    await writeFile(
      referencePath(userData, preset.id, reference.id),
      Buffer.from(image.data, "base64"),
    );
    const next = presets.map((item) =>
      item.id === preset.id
        ? { ...item, referenceImages: [...item.referenceImages, reference] }
        : item,
    );
    await writePresets(userData, next);
    return next;
  });
  writes = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export async function removeAiStyleReference(
  userData: string,
  presetId: string,
  referenceId: string,
) {
  const update = writes.then(async () => {
    const presets = await readPresets(userData);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) throw new Error("AI style preset not found");
    if (
      !preset.referenceImages.some((reference) => reference.id === referenceId)
    )
      throw new Error("AI style reference not found");
    const next = presets.map((item) =>
      item.id === presetId
        ? {
            ...item,
            referenceImages: item.referenceImages.filter(
              (reference) => reference.id !== referenceId,
            ),
          }
        : item,
    );
    await writePresets(userData, next);
    await unlink(referencePath(userData, presetId, referenceId)).catch(
      () => undefined,
    );
    return next;
  });
  writes = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

export async function loadAiStyleReference(
  userData: string,
  presetId: string,
  referenceId: string,
): Promise<AiImage> {
  const presets = await readPresets(userData);
  const preset = presets.find((item) => item.id === presetId);
  const reference = preset?.referenceImages.find(
    (item) => item.id === referenceId,
  );
  if (!reference) throw new Error("AI style reference not found");
  return {
    mimeType: reference.mimeType,
    data: (
      await readFile(referencePath(userData, presetId, referenceId))
    ).toString("base64"),
  };
}
