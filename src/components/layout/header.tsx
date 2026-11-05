import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, ShieldCheck, Briefcase, Plus, FileText } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground hover:opacity-90"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <span>TalentLens</span>
            </Link>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex text-[11px] font-medium border-border"
            >
              Staffing Screening Portal
            </Badge>
          </div>

          <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Overview
            </Link>
            <Link
              href="/requisitions"
              className="flex items-center gap-1.5 text-foreground font-semibold hover:text-primary transition-colors"
            >
              <FileText className="h-4 w-4" />
              <span>Requisitions</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <nav className="hidden lg:flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>DPDP Aligned</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
              <Briefcase className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Company A (Noida)</span>
            </div>
          </nav>

          <Link href="/requisitions/new">
            <Button size="sm" className="gap-1.5 shadow-sm text-xs h-8">
              <Plus className="h-3.5 w-3.5" />
              <span>New Requisition</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
