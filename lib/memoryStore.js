import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

export async function readLatestMemory() {
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed?.latest_memory ?? null;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeLatestMemory(memory) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const payload = {
    latest_memory: memory ?? null
  };

  await fs.writeFile(MEMORY_FILE, JSON.stringify(payload, null, 2), "utf-8");
}