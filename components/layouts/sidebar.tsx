"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Plug,
  ShieldCheck,
  FileText,
  Users,
  Settings as SettingsIcon,
  FolderTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
  children?: NavItem[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Getting Started", icon: LayoutGrid, exact: true },
  {
    href: "/connections",
    label: "Connections",
    icon: Plug,
    children: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/teams", label: "Teams", icon: FolderTree },
    ],
  },
  { href: "/permissions", label: "Permissions", icon: ShieldCheck },
  { href: "/audit", label: "Audit", icon: FileText },
];

function NavLink({ item, pathname, nested = false }: { item: NavItem; pathname: string; nested?: boolean }) {
  const Icon = item.icon;
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
        nested ? "pl-9 pr-3" : "px-3",
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

export function Sidebar({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 p-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground text-sm font-bold">
          +
        </div>
        <div className="text-sm font-semibold">AI Connectivity</div>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <div key={item.href}>
            <NavLink item={item} pathname={pathname} />
            {item.children && (
              <div className="mt-0.5 space-y-0.5">
                {item.children.map((child) => (
                  <NavLink key={child.href} item={child} pathname={pathname} nested />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/60">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-sidebar-foreground/60">{user.role}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <SettingsIcon className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
