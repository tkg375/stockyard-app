"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";

export default function VetLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Login failed." });
        return;
      }
      if (data.user?.role !== "vet") {
        setMsg({ type: "error", text: "This portal is for veterinarians only. Please use the customer login." });
        // Log out the session we just created
        await fetch("/api/auth/logout", { method: "POST" });
        return;
      }
      router.push("/vet-dashboard");
    } catch {
      setMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <SiteNav />
      <div className="auth-container">

        <div className="auth-card">
          {/* Vet Badge */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            background: "rgba(91,196,196,0.15)", border: "1px solid rgba(91,196,196,0.4)",
            color: "#1a6a6a", padding: "10px 20px", borderRadius: "30px", marginBottom: "24px",
          }}>
            <span style={{ fontSize: "1.2rem" }}>🩺</span>
            <span style={{ fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>
              Veterinarian Portal
            </span>
          </div>

          <h2 style={{
            fontFamily: "var(--font-display)", fontSize: "1.6rem",
            color: "#1a6a6a", textAlign: "center", marginBottom: "8px",
          }}>
            Vet Sign In
          </h2>
          <p style={{ textAlign: "center", color: "#666", marginBottom: "24px" }}>
            Access your veterinarian dashboard
          </p>

          {msg && (
            <div className={`auth-message ${msg.type}`} style={{ display: "block" }}>
              {msg.text}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: "8px" }}>
              {loading ? "Signing in…" : "Sign In to Vet Dashboard"}
            </button>
          </form>

          <div style={{
            marginTop: "24px", padding: "16px",
            background: "var(--color-cream-dark)", borderRadius: "8px", textAlign: "center",
          }}>
            <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 4px" }}>
              <strong>Not a veterinarian?</strong>
            </p>
            <Link href="/manage" style={{ color: "#1a6a6a", fontSize: "0.9rem", fontWeight: 600 }}>
              Go to Customer Login →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
