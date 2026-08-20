import { Activity } from "lucide-react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">MedXup</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Evidence-linked pediatric screening and medication safety support.
            </p>
          </div>

          {/* Product */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Product</h4>
            <nav className="flex flex-col gap-2">
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                How It Works
              </a>
              <Link to="/signup" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Try Demo
              </Link>
              <a href="#book-pilot" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Book a Pilot
              </a>
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Legal</h4>
            <nav className="flex flex-col gap-2">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Disclaimer
              </a>
            </nav>
          </div>

          {/* Contact */}
          <div className="space-y-3" id="contact">
            <h4 className="text-sm font-semibold">Contact</h4>
            <nav className="flex flex-col gap-2">
              <a href="mailto:hello@medxup.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                hello@medxup.com
              </a>
              <p className="text-sm text-muted-foreground">
                For pilot inquiries and partnerships
              </p>
            </nav>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-8">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} MedXup. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
