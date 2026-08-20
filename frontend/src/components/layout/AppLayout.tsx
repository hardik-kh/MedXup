import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { Disclaimer } from "./Disclaimer";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className={isMobile ? "pt-14 min-h-screen pb-12" : "ml-64 min-h-screen pb-12"}>
        {children}
      </main>
      <Disclaimer />
    </div>
  );
}
