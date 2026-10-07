"use client";

import { useEffect, useState } from "react";
import { Plus, X, TrendingUp, TrendingDown, ListPlus, Loader } from "lucide-react";
import { type PartyId, type PositionLeg, type Venue, type Side, usd } from "@/lib/margin";

interface PositionBuilderModalProps {
  party: PartyId;
  partyName: string;
  isOpen: boolean;
  onClose: () => void;
  onAddLeg: (leg: PositionLeg) => void;
  sessionId?: string;
}

interface OracleMark {
  symbol: string;
  priceUsd: number;
  status: "live" | "stale" | "fallback";
  publishTime: string;
}

const BUCKETS: Array<{ bucket: string; label: string; venueHint: Venue; sideHint: Side; haircut: number }> = [
  { bucket: "SOL", label: "SOL (perp or spot)", venueHint: "drift", sideHint: "long", haircut: 0.15 },
  { bucket: "BTC", label: "BTC (perp or spot)", venueHint: "drift", sideHint: "long", haircut: 0.15 },
  { bucket: "ETH", label: "ETH (perp or spot)", venueHint: "drift", sideHint: "long", haircut: 0.15 },
  { bucket: "USD", label: "USDC (lend / deposit)", venueHint: "kamino", sideHint: "lend", haircut: 0.1 },
  { bucket: "AAPL", label: "tAAPL (mock equity)", venueHint: "mock_equity", sideHint: "long", haircut: 0.25 },
];

/**
 * Add-position modal. Marks come from the live `/api/v1/oracle/prices`
 * endpoint (Hermes) — no hardcoded prices. When the oracle is unreachable
 * the modal surfaces the failure instead of inventing a number.
 */
export function PositionBuilderModal({
  party,
  partyName,
  isOpen,
  onClose,
  onAddLeg,
}: PositionBuilderModalProps) {
  const [marks, setMarks] = useState<Record<string, OracleMark> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [bucket, setBucket] = useState(BUCKETS[0].bucket);
  const [venue, setVenue] = useState<Venue>("drift");
  const [side, setSide] = useState<Side>("long");
  const [amountUsd, setAmountUsd] = useState<number>(100_000);
  const [manualMark, setManualMark] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function loadPrices() {
      setLoading(true);
      setLoadError(null);
      setMarks(null);
      try {
        const res = await fetch("/api/v1/oracle/prices", { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          setLoadError(body?.message ?? `Oracle request failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as {
          prices: Record<string, { priceUsd: number; status: OracleMark["status"]; publishTime: string }>;
        };
        const normalized: Record<string, OracleMark> = {};
        for (const [symbol, p] of Object.entries(data.prices ?? {})) {
          if (p && p.priceUsd > 0) {
            normalized[symbol] = {
              symbol,
              priceUsd: p.priceUsd,
              status: p.status,
              publishTime: p.publishTime,
            };
          }
        }
        setMarks(normalized);
      } catch {
        setLoadError("Could not reach the oracle endpoint. Check your connection and retry.");
      } finally {
        setLoading(false);
      }
    }

    void loadPrices();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bucketInfo = BUCKETS.find((b) => b.bucket === bucket) ?? BUCKETS[0];
  const oracle = marks ? marks[bucket === "USD" ? "USDC" : bucket] : undefined;
  const markUsd = oracle ? oracle.priceUsd : manualMark ? Number(manualMark) : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!markUsd || markUsd <= 0) {
      setSubmitError("No valid mark price. Retry the oracle or enter a manual mark.");
      return;
    }
    const qty = amountUsd / markUsd;
    const signedExposureUsd = side === "short" || side === "borrow" ? -amountUsd : amountUsd;

    const newLeg: PositionLeg = {
      party,
      venue,
      instrument: `${bucket === "AAPL" ? "tAAPL" : bucket === "USD" ? "USDC" : bucket} ${side}`,
      bucket,
      side,
      qty: Math.round(qty * 1000) / 1000,
      notionalUsd: amountUsd,
      signedExposureUsd,
      haircut: bucketInfo.haircut,
      markUsd: Math.round(markUsd * 100) / 100,
      source: oracle ? (oracle.status === "live" ? "live" : oracle.status) : "manual",
    };
    onAddLeg(newLeg);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Add position to ${partyName}`}
    >
      <div className="relative w-full max-w-lg rounded-[24px] border border-border bg-card p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground uppercase tracking-wider">
              <ListPlus className="h-3 w-3" aria-hidden />
              <span>Position builder</span>
            </div>
            <h3 className="text-xl font-bold text-foreground tracking-tight mt-1">
              Add a position to {partyName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <Loader className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Fetching live oracle marks…
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
          >
            <p className="font-semibold">Oracle marks unavailable</p>
            <p className="mt-1">{loadError}</p>
            <p className="mt-1 text-muted-foreground">
              You can still add a position by entering a manual mark price below.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Asset / bucket */}
          <fieldset className="space-y-2" disabled={loading}>
            <legend className="text-xs font-semibold text-muted-foreground">Asset bucket</legend>
            <div className="grid grid-cols-2 gap-2">
              {BUCKETS.map((b) => {
                const mark = marks ? marks[b.bucket === "USD" ? "USDC" : b.bucket] : undefined;
                return (
                  <button
                    type="button"
                    key={b.bucket}
                    onClick={() => {
                      setBucket(b.bucket);
                      setVenue(b.venueHint);
                      setSide(b.sideHint);
                    }}
                    aria-pressed={bucket === b.bucket}
                    className={`flex flex-col text-left p-2.5 rounded-xl border text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      bucket === b.bucket
                        ? "border-foreground bg-secondary text-foreground"
                        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="font-bold">{b.bucket}</span>
                    <span className="font-mono text-[11px]">
                      {mark
                        ? `${usd(mark.priceUsd, 2)}${mark.status !== "live" ? ` (${mark.status})` : ""}`
                        : b.bucket === "USD"
                        ? "~$1.00 peg"
                        : loadError
                        ? "no mark"
                        : "…"}
                    </span>
                  </button>
                );
              })}
              <div className="col-span-2 flex items-center justify-between rounded-xl border border-border bg-secondary px-3 py-2">
                <span className="text-[11px] text-muted-foreground">Venue</span>
                <label className="sr-only" htmlFor="pb-venue">
                  Venue
                </label>
                <select
                  id="pb-venue"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value as Venue)}
                  className="h-8 rounded-lg border border-border bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="drift">Drift (perps)</option>
                  <option value="kamino">Kamino (lend)</option>
                  <option value="mock_equity">Tokenized equity</option>
                  <option value="monad_fixture">Monad venue</option>
                  <option value="manual">Not venue-linked</option>
                </select>
              </div>
            </div>
          </fieldset>

          {/* Direction */}
          <fieldset className="space-y-2" disabled={loading}>
            <legend className="text-xs font-semibold text-muted-foreground">Direction</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["long", "lend", "short", "borrow"] as Side[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSide(s)}
                  aria-pressed={side === s}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold capitalize transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    side === s
                      ? s === "long" || s === "lend"
                        ? "border-success bg-success/20 text-success"
                        : "border-destructive bg-destructive/10 text-destructive"
                      : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  {s === "long" ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : s === "short" ? (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  ) : null}
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Size */}
          <div className="space-y-2">
            <label htmlFor="pb-size" className="text-xs font-semibold text-muted-foreground">
              Notional size (USD)
            </label>
            <input
              id="pb-size"
              type="number"
              inputMode="decimal"
              min={1000}
              max={50_000_000}
              step={5000}
              value={amountUsd}
              onChange={(e) => setAmountUsd(Math.max(0, Number(e.target.value) || 0))}
              className="h-10 w-full rounded-lg border border-border bg-secondary px-3 font-mono text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              id="pb-size-range"
              type="range"
              min={10_000}
              max={2_000_000}
              step={10_000}
              value={Math.min(amountUsd, 2_000_000)}
              onChange={(e) => setAmountUsd(Number(e.target.value))}
              aria-label="Notional size slider"
              className="w-full h-2 cursor-pointer"
            />
          </div>

          {/* Manual mark fallback when oracle missing for the bucket */}
          {!oracle && (
            <div className="space-y-2">
              <label htmlFor="pb-mark" className="text-xs font-semibold text-muted-foreground">
                Manual mark price (USD) — no live feed for {bucket}
              </label>
              <input
                id="pb-mark"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={manualMark}
                onChange={(e) => setManualMark(e.target.value)}
                placeholder="e.g. 38.50"
                className="h-10 w-full rounded-lg border border-border bg-secondary px-3 font-mono text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Computed preview */}
          <div className="rounded-xl border border-border bg-secondary p-3 text-xs font-mono text-muted-foreground space-y-1">
            <div className="flex justify-between text-foreground font-semibold">
              <span>Estimated units:</span>
              <span className="tabular-nums">{markUsd > 0 ? (amountUsd / markUsd).toFixed(4) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>Required siloed margin ({(bucketInfo.haircut * 100).toFixed(0)}%):</span>
              <span className="tabular-nums">{usd(amountUsd * bucketInfo.haircut)}</span>
            </div>
            {markUsd > 0 && (
              <div className="flex justify-between">
                <span>Mark source:</span>
                <span>{oracle ? `Pyth Hermes (${oracle.status})` : "desk-supplied"}</span>
              </div>
            )}
          </div>

          {submitError && (
            <p role="alert" className="text-xs text-destructive">
              {submitError}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || (!markUsd && !manualMark)}
            className="btn-press w-full flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span>Add position to {partyName}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
