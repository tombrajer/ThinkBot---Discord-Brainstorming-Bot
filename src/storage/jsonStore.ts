import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { StoreState } from "../domain/types.js";

const defaultState = (): StoreState => ({
  projects: [],
  sessions: [],
  messages: [],
  memories: [],
  reports: [],
  scopes: {},
});

export class JsonStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<StoreState> {
    if (!existsSync(this.filePath)) {
      return defaultState();
    }

    const raw = readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      return defaultState();
    }

    return JSON.parse(raw) as StoreState;
  }

  async write(state: StoreState): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  async update<T>(updater: (state: StoreState) => T): Promise<T> {
    const state = await this.read();
    const result = updater(state);
    await this.write(state);
    return result;
  }
}
