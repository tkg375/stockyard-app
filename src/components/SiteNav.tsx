"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function SiteNav() {
  const [user, setUser] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        {/* Hamburger — left on mobile, hidden on desktop */}
        <button
          className="nav-burger"
          aria-label="Toggle menu"
          onClick={() => setDrawerOpen((o) => !o)}
        >
          {drawerOpen ? "✕" : "☰"}
        </button>

        {/* Logo — center */}
        <Link href="/" className="nav-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-trimmed.png" alt="Stockyard Animal Health" className="nav-logo-img" />
        </Link>

        {/* Auth buttons — right */}
        <div className="nav-actions">
          {user ? (
            <>
              {user.role === "vet" ? (
                <button
                  className="nav-login"
                  style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("vet-tab", { detail: "settings" }));
                    router.push("/vet-dashboard?tab=settings");
                  }}
                >
                  My Profile
                </button>
              ) : null}
              <button onClick={handleLogout} className="nav-cta">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/manage" className="nav-login">My Appointment</Link>
              <Link href="/book" className="nav-cta">Book Now</Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`nav-drawer${drawerOpen ? " open" : ""}`}>
        <Link href="/about" onClick={() => setDrawerOpen(false)}>About Dr. McMillen</Link>
        {user ? (
          <>
            {user.role === "vet" && (
              <>
                <Link href="/vet-dashboard" onClick={() => setDrawerOpen(false)}>Vet Dashboard</Link>
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    window.dispatchEvent(new CustomEvent("vet-tab", { detail: "settings" }));
                    router.push("/vet-dashboard?tab=settings");
                  }}
                  style={{ display: "block", padding: "10px 8px", fontFamily: "var(--font-body)", fontSize: "0.95rem", fontWeight: 700, color: "#1a6a6a", background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  My Profile
                </button>
              </>
            )}
            <button
              onClick={() => { setDrawerOpen(false); handleLogout(); }}
              style={{
                display: "block", padding: "10px 8px",
                fontFamily: "var(--font-body)", fontSize: "0.95rem",
                fontWeight: 700, color: "#E8427A",
                background: "none", border: "none",
                cursor: "pointer", textAlign: "left", width: "100%",
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/manage" onClick={() => setDrawerOpen(false)}>My Appointment</Link>
            <Link href="/book" onClick={() => setDrawerOpen(false)}>
              Book a Consultation
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
