"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Layers, ShieldCheck, Users, Zap } from "lucide-react";

const LINKS = [
  { href: "/clear", label: "Clear", icon: Layers },
  { href: "/deal", label: "Deal rooms", icon: Users },
  { href: "/monad", label: "Monad", icon: Zap },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/trust", label: "Trust", icon: ShieldCheck },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex items-center gap-0.5 text-sm sm:gap-1.5">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-1.5 rounded-md px-2 py-2.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 ${
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
            <span
              aria-hidden
              className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground transition-opacity duration-200 sm:inset-x-3 ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
