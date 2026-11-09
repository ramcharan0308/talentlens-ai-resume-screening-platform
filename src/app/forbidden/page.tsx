import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft, Building2 } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="text-center max-w-lg space-y-6 p-8 rounded-2xl border border-border bg-card/80 backdrop-blur-sm shadow-xl">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center shadow-inner">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <span className="inline-block text-[11px] font-mono font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            HTTP 403 • Authorization Boundary
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Access Restricted
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your current account credentials do not grant access to this agency workspace or client organization resource. Strict tenant isolation and role-based policies are enforced.
          </p>
        </div>

        <div className="p-3.5 bg-muted/40 rounded-xl border border-border/60 text-xs text-muted-foreground text-left space-y-1.5">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            <span>Enforced Security Boundaries:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
            <li>Client hiring managers can only view candidates submitted to their exact organization.</li>
            <li>Agency recruiters cannot inspect client-internal decision metrics without agency assignment.</li>
            <li>Direct cross-tenant URL manipulation is recorded in the platform audit log.</li>
          </ul>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/requisitions" className="w-full sm:w-auto">
            <Button variant="default" className="w-full sm:w-auto gap-2 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Agency Workspace</span>
            </Button>
          </Link>
          <Link href="/client" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto gap-2 text-xs">
              <span>Go to Client Portal</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
