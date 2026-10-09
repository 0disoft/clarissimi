import { readFile } from "node:fs/promises";

export async function readActionJsonFile(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
}
