import { Lock, Cpu, Unlock, FileLock2, ArrowDownRight, ArrowUpRight } from "lucide-react";

function VignetteFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-background">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-40"
      />
      <div className="relative flex h-44 flex-col justify-center px-5">{children}</div>
      <span className="absolute bottom-2.5 right-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function BookRow({
  side,
  leg,
  amount,
  sealed,
}: {
  side: "A" | "B";
  leg: string;
  amount: string;
  sealed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-secondary font-mono text-[9px] font-semibold text-muted-foreground">
          {side}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{leg}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="font-mono text-[11px] tabular-nums text-foreground">{amount}</span>
        {sealed ? (
          <Lock className="h-3 w-3 text-steel" aria-label="Encrypted" />
        ) : (
          <span className="h-3 w-3" aria-hidden />
        )}
      </div>
    </div>
  );
}

export function SealVisual() {
  return (
    <VignetteFrame label="Client-side sealing">
      <div className="space-y-2">
        <BookRow side="A" leg="SOL LEND · KAMINO" amount="+$90,000" sealed />
        <BookRow side="B" leg="SOL-PERP SHORT · DRIFT" amount="-$95,000" sealed />
        <BookRow side="A" leg="tAAPL LONG · XSTOCKS" amount="+$55,000" sealed />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-success/25 bg-success/10 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-success">
          Independent keys · sealed locally
        </span>
        <FileLock2 className="h-3.5 w-3.5 text-success" aria-hidden />
      </div>
    </VignetteFrame>
  );
}

export function NetVisual() {
  return (
    <VignetteFrame label="Confidential compute">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5">
            <span className="font-mono text-[9px] font-semibold text-muted-foreground">A</span>
            <span className="font-mono text-[10px] text-muted-foreground">sealed</span>
          </div>
          <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5">
            <span className="font-mono text-[9px] font-semibold text-muted-foreground">B</span>
            <span className="font-mono text-[10px] text-muted-foreground">sealed</span>
          </div>
        </div>

        <div
          aria-hidden
          className="min-w-0 flex-1 border-t border-dashed border-border"
        />

        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5">
          <Cpu className="h-4 w-4 text-steel" aria-hidden />
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            MPC / TEE
          </span>
        </div>

        <div aria-hidden className="min-w-0 flex-1 border-t border-dashed border-border" />

        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-lg font-semibold tabular-nums leading-none">
            $24,500
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            net IM · scalar out
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">A input</span>
        <span className="font-mono text-[10px] text-muted-foreground">?</span>
        <span className="font-mono text-[10px] text-muted-foreground">B input</span>
        <span className="font-mono text-[10px] uppercase text-steel">never decrypted</span>
      </div>
    </VignetteFrame>
  );
}

export function EscrowVisual() {
  return (
    <VignetteFrame label="On-chain escrow">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-3">
          <Unlock className="h-4 w-4 text-foreground" aria-hidden />
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            escrow
          </span>
        </div>

        <div
          aria-hidden
          className="min-w-0 flex-1 border-t border-dashed border-border"
        />

        <div className="w-36 space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
            <span className="font-mono text-[10px] text-muted-foreground">Desk A</span>
            <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-success">
              <ArrowDownRight className="h-3 w-3" aria-hidden />
              $12,250
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
            <span className="font-mono text-[10px] text-muted-foreground">Desk B</span>
            <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-success">
              <ArrowDownRight className="h-3 w-3" aria-hidden />
              $12,250
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-success/25 bg-success/10 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-success">
          Excess released at attestation
        </span>
        <span className="flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums text-success">
          <ArrowUpRight className="h-3 w-3" aria-hidden />
          +$22,000.00
        </span>
      </div>
    </VignetteFrame>
  );
}
