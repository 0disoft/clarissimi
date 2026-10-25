import { readFile } from "node:fs/promises";

export async function readActionJsonFile(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // V8 can include input excerpts. Retain only its numeric location suffix.
    const location = /\(line ([1-9]\d*) column ([1-9]\d*)\)$/.exec(error.message);
    const detail = location === null ? "" : ` at line ${location[1]}, column ${location[2]}`;
    throw new SyntaxError(`Invalid JSON in Action input${detail}.`);
  }
}
