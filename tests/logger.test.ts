/**
 * Log hygiene: secret-shaped keys are redacted at any nesting depth, including
 * inside arrays, and over-long strings are truncated so a book or payload
 * cannot leak into logs verbatim.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeLogger } from "../lib/logger";

type Sink = { lines: string[]; restore: () => void };

function capture(): Sink {
  const original = console.log;
  const lines: string[] = [];
  console.log = (line?: unknown) => {
    lines.push(String(line));
  };
  return { lines, restore: () => (console.log = original) };
}

let sink: Sink | null = null;
afterEach(() => {
  sink?.restore();
  sink = null;
});

function emit(meta: Record<string, unknown>): { meta: Record<string, unknown> } {
  sink = capture();
  makeLogger("test").debug("event", meta);
  assert.equal(sink.lines.length, 1);
  return JSON.parse(sink.lines[0]) as { meta: Record<string, unknown> };
}

describe("logger redaction", () => {
  it("redacts secret-shaped keys", () => {
    const rec = emit({ sessionToken: "abc", authorization: "Bearer x", password: "p" });
    assert.equal(rec.meta.sessionToken, "<redacted>");
    assert.equal(rec.meta.authorization, "<redacted>");
    assert.equal(rec.meta.password, "<redacted>");
  });

  it("redacts secrets nested inside arrays", () => {
    const rec = emit({ attempts: [{ token: "leak" }, { wallet: "ok" }] });
    const attempts = rec.meta.attempts as Array<Record<string, unknown>>;

    assert.equal(attempts[0].token, "<redacted>");
    assert.equal(attempts[1].wallet, "ok");
  });

  it("truncates over-long strings but leaves short values intact", () => {
    const long = "x".repeat(500);
    const rec = emit({ book: long, venue: "drift" });
    assert.ok(String(rec.meta.book).length < long.length);
    assert.ok(String(rec.meta.book).endsWith("…"));
    assert.equal(rec.meta.venue, "drift");
  });

  it("preserves null and undefined safely", () => {
    const rec = emit({ a: null, b: undefined });
    assert.equal(rec.meta.a, null);
    assert.equal(rec.meta.b, undefined);
  });
});
