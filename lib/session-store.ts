/**
 * Deal-room session persistence.
 *
 * Two backends behind one interface:
 *  - memory: fast Map, lost on restart, per-instance (dev)
 *  - file:   atomic JSON store on local disk with TTL eviction
 *            (single-instance production default)
 *
 * The interface is deliberately narrow (get/set/delete/list) so a Redis or
 * Postgres implementation can slot in for multi-instance deployments without
 * touching orchestration code. In-memory rate limiting, however, is always
 * per-instance until then — see README "Deploy & operations".
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { env } from "./env";
import { makeLogger } from "./logger";
import type { DealSession } from "./deal-session";

const log = makeLogger("store");

export interface SessionStore {
  readonly mode: "memory" | "file";
  get(id: string): DealSession | null;
  set(session: DealSession): void;
  delete(id: string): void;
  all(): DealSession[];
}

// ---------------------------------------
// Memory store
// ---------------------------------------
class MemoryStore implements SessionStore {
  readonly mode = "memory" as const;
  private map = new Map<string, DealSession>();

  private evictExpired() {
    const cutoff = Date.now() - env.store.ttlMs;
    for (const [id, s] of this.map) {
      if (s.updatedAt < cutoff) this.map.delete(id);
    }
  }

  get(id: string): DealSession | null {
    this.evictExpired();
    return this.map.get(id) ?? null;
  }

  set(session: DealSession): void {
    this.map.set(session.sessionId, session);
    this.evictExpired();
  }

  delete(id: string): void {
    this.map.delete(id);
  }

  all(): DealSession[] {
    this.evictExpired();
    return [...this.map.values()];
  }
}

// ---------------------------------------
// File store (atomic writes, TTL eviction)
// ---------------------------------------
export class FileStore implements SessionStore {
  readonly mode = "file" as const;
  private map = new Map<string, DealSession>();
  private readonly filePath: string;
  private loaded = false;
  private readonly ttlMs: number | undefined;

  constructor(dirOverride?: string, ttlMsOverride?: number) {
    this.ttlMs = ttlMsOverride;
    const dir = resolve(process.cwd(), dirOverride ?? env.runtime.dataDir);
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      log.error("cannot create data dir — falling back to memory store", {
        dataDir: dir,
        error: err instanceof Error ? err.message : String(err),
      });
      // Degrade to in-memory behavior with mode still "file".
      this.filePath = "";
      return;
    }
    this.filePath = join(dir, "sessions.json");
  }

  private load() {
    if (this.loaded || !this.filePath) return;
    this.loaded = true;
    if (!existsSync(this.filePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, DealSession>;
      const cutoff = Date.now() - (this.ttlMs ?? env.store.ttlMs);
      for (const [id, s] of Object.entries(raw)) {
        if (s && typeof s === "object" && typeof s.updatedAt === "number" && s.updatedAt >= cutoff) {
          this.map.set(id, s);
        }
      }
      log.info("session store loaded from disk", { entries: this.map.size });
    } catch (err) {
      // Corrupt file: back it up and start clean rather than crash the API.
      log.error("session store corrupt — starting clean", {
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      } catch {
        // ignore
      }
    }
  }

  private persist() {
    if (!this.filePath) return;
    try {
      const payload = JSON.stringify(Object.fromEntries(this.map));
      const tmp = `${this.filePath}.tmp-${process.pid}`;
      writeFileSync(tmp, payload, "utf8");
      renameSync(tmp, this.filePath); // atomic on POSIX
    } catch (err) {
      log.error("session store write failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private evictExpired(persist: boolean) {
    const cutoff = Date.now() - (this.ttlMs ?? env.store.ttlMs);
    let evicted = 0;
    for (const [id, s] of this.map) {
      if (s.updatedAt < cutoff) {
        this.map.delete(id);
        evicted++;
      }
    }
    if (persist && evicted > 0) this.persist();
  }

  get(id: string): DealSession | null {
    this.load();
    this.evictExpired(false);
    return this.map.get(id) ?? null;
  }

  set(session: DealSession): void {
    this.load();
    this.map.set(session.sessionId, session);
    this.evictExpired(true);
    this.persist();
  }

  delete(id: string): void {
    this.load();
    this.map.delete(id);
    this.persist();
  }

  all(): DealSession[] {
    this.load();
    this.evictExpired(false);
    return [...this.map.values()];
  }
}

function createStore(): SessionStore {
  if (env.store.mode === "memory") return new MemoryStore();
  const file = new FileStore();
  if (file.mode === "file" && !("filePath" in file && (file as unknown as { filePath: string }).filePath)) {
    // Constructor failed to set up the file path — degrade to memory.
    return new MemoryStore();
  }
  return file;
}

const globalForStore = globalThis as unknown as { __obligorSessionStore?: SessionStore };
export const sessionStore: SessionStore =
  globalForStore.__obligorSessionStore ?? (globalForStore.__obligorSessionStore = createStore());
