import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function NotFound() {
  return (
    <PageShell>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">404</p>
        <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
          No clearing session here
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          That page doesn&rsquo;t exist. Head back to the clearing demo.
        </p>
        <Link
          href="/clear"
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity duration-100 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Open clearing demo
        </Link>
      </div>
    </PageShell>
  );
}
