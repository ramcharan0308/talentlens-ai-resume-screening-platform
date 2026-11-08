"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ShieldCheck,
  FileText,
  Users,
  UploadCloud,
  LogOut,
  LogIn,
  BarChart3,
  Plus,
  Menu,
  X,
  Building2,
  ChevronDown,
} from "lucide-react";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "RECRUITER" | "CLIENT_HIRING_MGR" | "DELIVERY_HEAD";
  organizationId: string;
  organizationName: string;
  organizationType: "AGENCY" | "CLIENT";
}

function getUserInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getRoleBadgeVariant(role: string): "default" | "info" | "outline" | "secondary" {
  switch (role) {
    case "DELIVERY_HEAD":
      return "info";
    case "RECRUITER":
      return "default";
    case "CLIENT_HIRING_MGR":
      return "outline";
    default:
      return "outline";
  }
}

function getRoleDisplayName(role: string): string {
  switch (role) {
    case "DELIVERY_HEAD":
      return "Delivery Head";
    case "RECRUITER":
      return "Recruiter";
    case "CLIENT_HIRING_MGR":
      return "Client Hiring Manager";
    default:
      return role;
  }
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [navMoreOpen, setNavMoreOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const navMoreRef = useRef<HTMLDivElement>(null);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    setNavMoreOpen(false);
  }

  // Handle outside clicks and keyboard navigation (Escape to close)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
      if (
        navMoreRef.current &&
        !navMoreRef.current.contains(event.target as Node)
      ) {
        setNavMoreOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setNavMoreOpen(false);
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.success && data?.data) {
          setUser(data.data);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setProfileMenuOpen(false);
      setMobileMenuOpen(false);
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const isRecruiter = user?.role === "RECRUITER";
  const isDeliveryHead = user?.role === "DELIVERY_HEAD";
  const isClientMgr = user?.role === "CLIENT_HIRING_MGR";

  const isActive = (href: string) => {
    if (href === "/" && pathname !== "/") return false;
    return pathname.startsWith(href);
  };

  const isSecondaryActive =
    isActive("/retention") ||
    isActive("/delivery/dashboard") ||
    isActive("/resumes/upload");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-[#131615]/92 backdrop-blur-xl shadow-md">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between gap-3 min-w-0">
        {/* Left: Branding & Main Navigation */}
        <div className="flex items-center gap-3 md:gap-4 lg:gap-6 min-w-0 flex-shrink">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-foreground transition-opacity hover:opacity-90 group select-none flex-shrink-0"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs transition-transform group-hover:scale-105">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold tracking-tight text-foreground leading-none">
                TalentLens
              </span>
              <span className="text-[10px] tracking-wider font-mono text-muted-foreground uppercase leading-none mt-1">
                Ops Platform
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm min-w-0" aria-label="Main Navigation">
            {isClientMgr ? (
              <>
                <Link
                  href="/client"
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    isActive("/client") && pathname === "/client"
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/client/requisitions"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    isActive("/client/requisitions")
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span>Requisitions</span>
                </Link>
                <Link
                  href="/candidates"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    isActive("/candidates")
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span>Candidates</span>
                </Link>
              </>
            ) : (
              <>
                {/* Core links always visible on md and up */}
                <Link
                  href="/"
                  className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-medium transition-colors text-xs lg:text-sm ${
                    pathname === "/"
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  Overview
                </Link>
                <Link
                  href="/requisitions"
                  className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg font-medium transition-colors text-xs lg:text-sm ${
                    isActive("/requisitions")
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span>Requisitions</span>
                </Link>
                <Link
                  href="/candidates"
                  className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg font-medium transition-colors text-xs lg:text-sm ${
                    isActive("/candidates")
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span>Candidates</span>
                </Link>

                {/* Secondary Links: Inline on 2xl (>=1536px), Collapsed to "More" below 2xl */}
                <div className="hidden 2xl:flex items-center gap-1">
                  <Link
                    href="/retention"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors text-sm ${
                      isActive("/retention")
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Governance</span>
                  </Link>
                  {isDeliveryHead && (
                    <Link
                      href="/delivery/dashboard"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors text-sm ${
                        isActive("/delivery/dashboard")
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <span>Delivery Ops</span>
                    </Link>
                  )}
                  {isRecruiter && (
                    <Link
                      href="/resumes/upload"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors text-sm ${
                        isActive("/resumes/upload")
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <UploadCloud className="h-4 w-4" />
                      <span>Bulk Ingest</span>
                    </Link>
                  )}
                </div>

                {/* "More" Dropdown Menu for md to xl screens */}
                <div className="relative hidden md:flex 2xl:hidden" ref={navMoreRef}>
                  <button
                    type="button"
                    onClick={() => setNavMoreOpen(!navMoreOpen)}
                    aria-expanded={navMoreOpen}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium text-xs transition-colors cursor-pointer ${
                      isSecondaryActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span>More</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-150 ${
                        navMoreOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {navMoreOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full mt-1.5 w-48 rounded-xl border border-border/80 bg-[#1A1D1C] p-1.5 shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-100 space-y-0.5"
                    >
                      <Link
                        href="/retention"
                        onClick={() => setNavMoreOpen(false)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                          isActive("/retention")
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-foreground hover:bg-muted/70"
                        }`}
                      >
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span>Governance</span>
                      </Link>
                      {isDeliveryHead && (
                        <Link
                          href="/delivery/dashboard"
                          onClick={() => setNavMoreOpen(false)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                            isActive("/delivery/dashboard")
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-foreground hover:bg-muted/70"
                          }`}
                        >
                          <BarChart3 className="h-4 w-4 text-primary" />
                          <span>Delivery Ops</span>
                        </Link>
                      )}
                      {isRecruiter && (
                        <Link
                          href="/resumes/upload"
                          onClick={() => setNavMoreOpen(false)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                            isActive("/resumes/upload")
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-foreground hover:bg-muted/70"
                          }`}
                        >
                          <UploadCloud className="h-4 w-4 text-primary" />
                          <span>Bulk Ingest</span>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>

        {/* Right: Quick actions & User Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 ml-auto">
          {user ? (
            <>
              {/* Organization and Role Indicator */}
              <div className="hidden lg:flex items-center gap-1.5 text-xs">
                <div
                  className="flex items-center gap-1.5 text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md border border-border/50 max-w-[130px] xl:max-w-[180px]"
                  title={user.organizationName}
                >
                  <Building2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="font-semibold text-foreground truncate">
                    {user.organizationName}
                  </span>
                </div>
                <Badge
                  variant={getRoleBadgeVariant(user.role)}
                  className="hidden 2xl:inline-flex text-[10px] font-mono tracking-wide px-2 py-0.5"
                >
                  {user.role}
                </Badge>
              </div>

              {/* Action Buttons for Authorized Roles */}
              {isRecruiter && (
                <Link href="/resumes/upload">
                  <Button
                    size="sm"
                    variant="outline"
                    className="hidden 2xl:inline-flex gap-1.5 text-xs h-8 px-2.5 font-medium border-border/80 hover:bg-muted/60"
                    title="Bulk Ingest Resumes"
                  >
                    <UploadCloud className="h-3.5 w-3.5 text-primary" />
                    <span>Upload CVs</span>
                  </Button>
                </Link>
              )}

              {(isRecruiter || isDeliveryHead) && (
                <Link href="/requisitions/new">
                  <Button
                    size="sm"
                    className="hidden sm:inline-flex gap-1.5 text-xs h-8 px-2.5 sm:px-3 font-semibold shadow-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Req</span>
                  </Button>
                </Link>
              )}

              {/* User Profile Menu Trigger */}
              <div className="relative flex-shrink-0" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/60 hover:border-border transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer select-none"
                  title="View user profile and account options"
                >
                  {/* Avatar with Initials & Online status */}
                  <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs shadow-2xs flex-shrink-0">
                    {getUserInitials(user.name)}
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                  </div>

                  {/* Name & Email Stack */}
                  <div className="hidden sm:flex flex-col text-left max-w-[100px] md:max-w-[120px] lg:max-w-[140px] xl:max-w-[160px] min-w-0">
                    <span className="text-xs font-semibold text-foreground leading-tight truncate">
                      {user.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight truncate font-mono">
                      {user.email}
                    </span>
                  </div>

                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 flex-shrink-0 ${
                      profileMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Rich Profile Dropdown Menu */}
                {profileMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border border-border/80 bg-[#1A1D1C] p-3.5 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-100 space-y-3"
                  >
                    {/* Header: Full Unclipped Name & Full Email */}
                    <div className="flex items-start gap-3 pb-3 border-b border-border/70">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-xs flex-shrink-0">
                        {getUserInitials(user.name)}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-bold text-foreground leading-snug break-words">
                          {user.name}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono break-all leading-normal">
                          {user.email}
                        </span>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Badge
                            variant={getRoleBadgeVariant(user.role)}
                            className="text-[10px] font-mono tracking-wide px-2 py-0.5"
                          >
                            {getRoleDisplayName(user.role)}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Organization / Tenant Info */}
                    <div className="py-2 px-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs space-y-1">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Organization ({user.organizationType})
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <Building2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="truncate">{user.organizationName}</span>
                      </div>
                    </div>

                    {/* Quick Role-Specific Navigation Shortcuts */}
                    <div className="space-y-0.5 text-xs">
                      {isRecruiter && (
                        <Link
                          href="/resumes/upload"
                          onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center justify-between p-2 rounded-md text-foreground hover:bg-muted/70 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <UploadCloud className="h-3.5 w-3.5 text-primary" />
                            <span>Upload Resumes</span>
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">Max 500</span>
                        </Link>
                      )}
                      {isDeliveryHead && (
                        <Link
                          href="/delivery/dashboard"
                          onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center justify-between p-2 rounded-md text-foreground hover:bg-muted/70 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <BarChart3 className="h-3.5 w-3.5 text-primary" />
                            <span>Delivery Ops Console</span>
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">48h SLA</span>
                        </Link>
                      )}
                      <Link
                        href="/retention"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center justify-between p-2 rounded-md text-foreground hover:bg-muted/70 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                          <span>DPDP Governance</span>
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">Sec. 12</span>
                      </Link>
                    </div>

                    {/* Logout Button */}
                    <div className="pt-2 border-t border-border/70">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/30 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Sign Out of TalentLens</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Menu Hamburger */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden h-8 w-8 p-0 text-muted-foreground flex-shrink-0"
                aria-label="Toggle Navigation Menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </>
          ) : !loading ? (
            <Link href="/login">
              <Button size="sm" className="gap-1.5 text-xs h-8">
                <LogIn className="h-3.5 w-3.5" />
                <span>Sign In</span>
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/80 bg-card p-4 space-y-3 shadow-lg animate-in slide-in-from-top-2 duration-150">
          {user && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-start gap-3 justify-between">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs shadow-2xs flex-shrink-0">
                  {getUserInitials(user.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">{user.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{user.email}</div>
                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">{user.organizationName}</div>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono flex-shrink-0">
                {user.role}
              </Badge>
            </div>
          )}

          <div className="flex flex-col space-y-1 text-sm font-medium">
            {isClientMgr ? (
              <>
                <Link
                  href="/client"
                  className={`p-2 rounded-md ${
                    pathname === "/client" ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/client/requisitions"
                  className={`p-2 rounded-md ${
                    isActive("/client/requisitions") ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  Assigned Requisitions
                </Link>
                <Link
                  href="/candidates"
                  className={`p-2 rounded-md ${
                    isActive("/candidates") ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  Submitted Candidates
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/"
                  className={`p-2 rounded-md ${
                    pathname === "/" ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  Overview
                </Link>
                <Link
                  href="/requisitions"
                  className={`p-2 rounded-md ${
                    isActive("/requisitions") ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  Requisitions
                </Link>
                <Link
                  href="/candidates"
                  className={`p-2 rounded-md ${
                    isActive("/candidates") ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  Candidates
                </Link>
                <Link
                  href="/retention"
                  className={`p-2 rounded-md ${
                    isActive("/retention") ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  Governance & Retention
                </Link>
                {isDeliveryHead && (
                  <Link
                    href="/delivery/dashboard"
                    className={`p-2 rounded-md ${
                      isActive("/delivery/dashboard") ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    Delivery Ops Dashboard
                  </Link>
                )}
                {isRecruiter && (
                  <Link
                    href="/resumes/upload"
                    className={`p-2 rounded-md ${
                      isActive("/resumes/upload") ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    Bulk Ingest CVs
                  </Link>
                )}
              </>
            )}

            {user && (
              <div className="pt-2 border-t border-border/70 mt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 p-2 rounded-md text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
