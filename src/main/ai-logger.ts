import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

type AiLogEvent = {
  timestamp: string;
  type: string;
  data: unknown;
};

type AiLogSession = {
  startedAt: string;
  appVersion: string;
  events: AiLogEvent[];
};

let logPath: string | null = null;
let session: AiLogSession | null = null;
let writeQueue = Promise.resolve();

export async function initializeAiLogger(
  userDataPath: string,
  appVersion: string,
) {
  await writeQueue;
  const directory = join(userDataPath, "ai-logs");
  const startedAt = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  logPath = join(
    directory,
    `ai-${startedAt.replace(/[:.]/g, "-")}-${process.pid}.json`,
  );
  session = { startedAt, appVersion, events: [] };
  await writeFile(logPath, JSON.stringify(session, null, 2));

  const files = (await readdir(directory))
    .filter((name) => /^ai-.*\.json$/.test(name))
    .sort()
    .reverse();
  await Promise.all(
    files.slice(5).map((name) => rm(join(directory, name), { force: true })),
  );
}

export function logAiEvent(type: string, data: unknown) {
  if (!logPath || !session) return Promise.resolve();
  session.events.push({ timestamp: new Date().toISOString(), type, data });
  let contents: string;
  try {
    contents = JSON.stringify(session, null, 2);
  } catch (error) {
    session.events.pop();
    console.error("Failed to serialize AI log", error);
    return Promise.resolve();
  }
  const path = logPath;
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => writeFile(path, contents))
    .catch((error) => console.error("Failed to write AI log", error));
  return writeQueue;
}
