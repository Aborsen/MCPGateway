"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Plug,
  ShieldCheck,
  FileText,
  Users,
  FolderTree,
  Settings,
  BookOpen,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Each nav item declares which permission category it belongs to. The
// dashboard layout computes the user's set of visible categories once and
// passes them in — this client component just filters.
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  category: string;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, category: "dashboard", exact: true },
  { href: "/connections", label: "Connections", icon: Plug, category: "connections" },
  { href: "/users", label: "Users", icon: Users, category: "users" },
  { href: "/workspaces", label: "Workspaces", icon: FolderTree, category: "workspaces" },
  { href: "/permissions", label: "Permissions", icon: ShieldCheck, category: "permissions" },
  { href: "/audit", label: "Audit", icon: FileText, category: "audit" },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  );
}

function AccountMenu({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-sidebar-foreground/60">{user.email}</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/specs" className="cursor-pointer">
            <BookOpen className="h-4 w-4" />
            <span>Specifications</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            if (!signingOut) void onSignOut();
          }}
          disabled={signingOut}
          className="cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>{signingOut ? "Signing out…" : "Sign out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({
  user,
  visibleCategories,
}: {
  user: { name: string; email: string; role: string };
  visibleCategories: string[];
}) {
  const pathname = usePathname();
  const visible = new Set(visibleCategories);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        className="flex items-center gap-2 p-4 transition-opacity hover:opacity-80"
        title="Back to dashboard"
      >
        <Image
          src="/logo.png"
          alt="MCP Gateway"
          width={28}
          height={28}
          className="rounded"
          priority
        />
        <div className="text-sm font-semibold">MCP Gateway</div>
      </Link>

      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.filter((item) => visible.has(item.category)).map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <AccountMenu user={user} />
      </div>
    </aside>
  );
}
