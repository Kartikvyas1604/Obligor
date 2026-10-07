"use client";

import { useMemo, useState } from "react";
import { Check, Copy, EyeOff, Trash2, Plus } from "lucide-react";
import { siloedIm, usd, type PositionBook, type PositionLeg } from "@/lib/margin";
import { ExposureBars } from "@/components/charts";

function truncateAddress(address: string, chars = 4) {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="relative inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors duration-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label={copied ? "Address copied" : `Copy address ${truncateAddress(address)}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-foreground" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

function ExplorerLink({ address }: { address: string }) {
  return (
    <a
      href={`https://explorer.solana.com/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`View ${address} on Solana Explorer`}
      className="underline-offset-4 transition-colors duration-100 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label={`View address ${truncateAddress(address)} on Solana Explorer, opens in new tab`}
    >
      {truncateAddress(address)}
    </a>
  );
}

function LegRow({
  leg,
  index,
  onDelete,
}: {
  leg: PositionLeg;
  index: number;
  onDelete?: () => void;
}) {
  const negative = leg.signedExposureUsd < 0;
  return (
    <li
      className="anim-fade-up flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors duration-150 hover:bg-secondary last:border-0"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground flex items-center gap-2">
          <span>{leg.instrument}</span>
          <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {leg.venue}
          </span>
          {leg.source === "live" && (
            <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground">
              live
            </span>
          )}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
          {leg.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })} @ {usd(leg.markUsd)} &bull; haircut{" "}
          {(leg.haircut * 100).toFixed(0)}%
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p
          className={`font-mono text-sm font-semibold tabular-nums ${
            negative ? "text-destructive" : "text-success"
          }`}
        >
          {negative ? "−" : "+"}
          {usd(Math.abs(leg.notionalUsd))}
        </p>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete this leg"
            aria-label={`Remove ${leg.instrument} position`}
            className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

export function BookColumn({
  title,
  wallet,
  legs,
  hidden,
  onDeleteLeg,
  onOpenAddModal,
}: {
  title: string;
  wallet: string;
  legs: PositionBook["legs"];
  hidden: boolean;
  onDeleteLeg?: (index: number) => void;
  onOpenAddModal?: () => void;
}) {
  const im = useMemo(() => siloedIm(legs), [legs]);

  if (hidden) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Sealed. This party&rsquo;s legs stay encrypted through the computation — that is the
          whole point.
        </p>
        <div className="mt-4 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 rounded bg-secondary animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card flex flex-col justify-between">
      <div>
        <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground tabular-nums">
            <ExplorerLink address={wallet} />
            <CopyAddress address={wallet} />
            {onOpenAddModal && (
              <button
                type="button"
                onClick={onOpenAddModal}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-foreground hover:bg-secondary font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3 w-3" aria-hidden />
                <span>Add position</span>
              </button>
            )}
          </div>
        </div>
        {legs.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">No positions yet</p>
            <p className="text-xs text-muted-foreground">
              Add a leg, or pick a quick scenario above.
            </p>
            {onOpenAddModal && (
              <button
                type="button"
                onClick={onOpenAddModal}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-4 py-1.5 text-xs text-foreground hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                <span>Add a position</span>
              </button>
            )}
          </div>
        ) : (
          <div>
            <ExposureBars legs={legs} />
            <ul className="border-t border-border">
              {legs.map((l, i) => (
                <LegRow
                  key={`${l.party}-${l.venue}-${l.instrument}-${i}`}
                  leg={l}
                  index={i}
                  onDelete={onDeleteLeg ? () => onDeleteLeg(i) : undefined}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between border-t border-border bg-card px-4 py-3 transition-colors duration-150">
        <p className="text-xs text-muted-foreground">Margin you hold alone (siloed)</p>
        <p className="font-mono text-sm font-bold text-foreground tabular-nums">{usd(im)}</p>
      </div>
    </div>
  );
}

