import { Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, ClipboardList, FileText, Settings, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearDemoSession, getDemoUser } from "@/lib/demoSession";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";

const navItems = [
  { path: "/screening", label: "Screening", icon: ClipboardList },
  { path: "/report", label: "Report", icon: FileText },
  { path: "#", label: "Settings", icon: Settings, disabled: true },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getDemoUser();

  const handleLogout = () => {
    clearDemoSession();
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Activity className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-sidebar-foreground">MedXup</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <div
                key={item.path}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
              >
                <Icon className="h-4 w-4" />
                {item.label}
                <span className="ml-auto text-xs">Soon</span>
              </div>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4">
        {user && (
          <div className="mb-3 rounded-lg bg-sidebar-accent/50 p-3">
            <p className="text-sm font-medium text-sidebar-foreground">{user.fullName}</p>
            <p className="text-xs text-muted-foreground">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Exit Demo
        </button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-sidebar px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary">
              <Activity className="h-3.5 w-3.5 text-sidebar-primary-foreground" />
            </div>
            <span className="text-base font-semibold text-sidebar-foreground">MedXup</span>
          </div>
        </header>
      </>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar">
      <SidebarContent />
    </aside>
  );
}
