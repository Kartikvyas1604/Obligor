"use client";

/**
 * In-memory capability tokens for the current tab's deal rooms.
 *
 * Deliberately NOT persisted (no localStorage/sessionStorage) — tokens live
 * only in JS memory, so they survive client-side navigation but disappear on
 * refresh. After a refresh a visitor keeps a confidential (read-only) view,
 * which is the safe default for shared invite links.
 */

const store = new Map<string, { A?: string; B?: string }>();

export function getPartyTokens(sessionId: string): { A?: string; B?: string } {
  return store.get(sessionId) ?? {};
}

export function setPartyTokens(sessionId: string, tokens: { A?: string; B?: string }): void {
  store.set(sessionId, { ...(store.get(sessionId) ?? {}), ...tokens });
}