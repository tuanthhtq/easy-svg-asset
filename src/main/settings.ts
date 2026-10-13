import { app, safeStorage } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppSettings, AppSettingsInput } from "../shared/types";

type StoredSettings = Omit<AppSettings, "hasAiSecret"> & {
  encryptedAiSecret?: string;
};

const DEFAULT_SETTINGS: StoredSettings = {
  autoSaveDelay: 500,
  aiApiUrl: "https://api.openai.com/v1/responses",
  aiModel: "",
};
let settingsWrites = Promise.resolve();

const settingsPath = () => join(app.getPath("userData"), "settings.json");

function publicSettings(settings: StoredSettings): AppSettings {
  return {
    autoSaveDelay: settings.autoSaveDelay,
    aiApiUrl: settings.aiApiUrl,
    aiModel: settings.aiModel,
    hasAiSecret: Boolean(settings.encryptedAiSecret),
  };
}

async function storedSettings(): Promise<StoredSettings> {
  try {
    const value: unknown = JSON.parse(await readFile(settingsPath(), "utf8"));
    if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
    const item = value as Partial<StoredSettings>;
    return {
      autoSaveDelay:
        typeof item.autoSaveDelay === "number" &&
        Number.isInteger(item.autoSaveDelay) &&
        item.autoSaveDelay >= 100 &&
        item.autoSaveDelay <= 10000
          ? item.autoSaveDelay
          : DEFAULT_SETTINGS.autoSaveDelay,
      aiApiUrl:
        typeof item.aiApiUrl === "string"
          ? item.aiApiUrl
          : DEFAULT_SETTINGS.aiApiUrl,
      aiModel: typeof item.aiModel === "string" ? item.aiModel : "",
      encryptedAiSecret:
        typeof item.encryptedAiSecret === "string"
          ? item.encryptedAiSecret
          : undefined,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return DEFAULT_SETTINGS;
    throw error;
  }
}

export async function getAppSettings() {
  return publicSettings(await storedSettings());
}

export async function saveAppSettings(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid settings");
  const input = value as Partial<AppSettingsInput>;
  if (
    typeof input.autoSaveDelay !== "number" ||
    !Number.isInteger(input.autoSaveDelay) ||
    input.autoSaveDelay < 100 ||
    input.autoSaveDelay > 10000
  )
    throw new Error("Auto-save delay must be between 100 and 10000 ms");
  if (typeof input.aiApiUrl !== "string" || input.aiApiUrl.length > 2048)
    throw new Error("Invalid OpenAI API URL");
  const url = new URL(input.aiApiUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("OpenAI API URL must use HTTP or HTTPS");
  if (typeof input.aiModel !== "string" || input.aiModel.length > 120)
    throw new Error("Invalid OpenAI model name");
  const current = await storedSettings();
  let encryptedAiSecret = current.encryptedAiSecret;
  if (input.aiSecret !== undefined) {
    if (typeof input.aiSecret !== "string" || input.aiSecret.length > 500)
      throw new Error("Invalid OpenAI API secret");
    if (input.aiSecret && !safeStorage.isEncryptionAvailable())
      throw new Error("Secure secret storage is unavailable on this system");
    encryptedAiSecret = input.aiSecret
      ? safeStorage.encryptString(input.aiSecret).toString("base64")
      : undefined;
  }
  const next: StoredSettings = {
    autoSaveDelay: input.autoSaveDelay,
    aiApiUrl: url.toString(),
    aiModel: input.aiModel.trim(),
    encryptedAiSecret,
  };
  const update = settingsWrites.then(async () => {
    await mkdir(app.getPath("userData"), { recursive: true });
    const path = settingsPath();
    const temporary = `${path}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2), { flag: "wx" });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  });
  settingsWrites = update.then(
    () => undefined,
    () => undefined,
  );
  await update;
  return publicSettings(next);
}

export async function getAiCredentials() {
  const settings = await storedSettings();
  if (!settings.aiModel) throw new Error("Set an OpenAI model in Settings");
  if (!settings.encryptedAiSecret)
    throw new Error("Set an OpenAI API secret in Settings");
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("Secure secret storage is unavailable on this system");
  return {
    url: settings.aiApiUrl,
    model: settings.aiModel,
    secret: safeStorage.decryptString(
      Buffer.from(settings.encryptedAiSecret, "base64"),
    ),
  };
}
