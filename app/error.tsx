"use client";

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-destructive">
        Computation failed
      </p>
      <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
        Couldn&rsquo;t complete this view
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Usually a transient render error. Your session data is intact — try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-5 text-sm font-medium transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <RefreshCcw className="h-4 w-4" aria-hidden />
        Retry
      </button>
    </div>
  );
}
