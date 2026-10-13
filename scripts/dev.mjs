import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packagePath = fileURLToPath(
  import.meta.resolve("electron-vite/package.json"),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(
  process.execPath,
  [join(dirname(packagePath), "bin/electron-vite.js"), "dev"],
  { env, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
