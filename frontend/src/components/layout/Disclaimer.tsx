import { AlertTriangle } from "lucide-react";

export function Disclaimer() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
      <div className="container flex items-center justify-center gap-2 py-2">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Educational prototype. Not for clinical use.
        </p>
      </div>
    </div>
  );
}
