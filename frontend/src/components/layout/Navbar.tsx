import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";

export function Navbar() {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold text-foreground">MedXup</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <a 
            href="#how-it-works" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            How It Works
          </a>
          <Link 
            to="/signup" 
            className={`text-sm font-medium transition-colors ${
              isActive("/signup") ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Demo
          </Link>
          <a 
            href="#contact" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/signup">
            <Button variant="outline" size="sm">
              Try Demo
            </Button>
          </Link>
          <a href="#book-pilot">
            <Button size="sm">
              Book a Pilot
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}
