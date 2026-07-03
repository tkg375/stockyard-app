"use client";

import { useState } from "react";

export default function TroubleModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [issue, setIssue] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, issue }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) setError(data.error ?? "Failed to send.");
      else setSent(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setSending(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 460, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {sent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 64, height: 64, background: "#f0fafa", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✅</div>
            <h3 style={{ color: "#1a6a6a", marginBottom: 8 }}>Message Sent!</h3>
            <p style={{ color: "#666", marginBottom: 24, fontSize: "0.9rem" }}>We'll get back to you as soon as possible at {email}.</p>
            <button onClick={onClose} className="btn btn-primary btn-full">Done</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ color: "#1a6a6a", margin: 0, fontSize: "1.2rem" }}>Having Trouble?</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
            </div>
            <p style={{ color: "#666", fontSize: "0.875rem", marginBottom: 20 }}>
              Let us know what's going on and we'll help you out.
            </p>
            <form onSubmit={submit}>
              <div className="form-group">
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Your Name</label>
                <input className="form-input" type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Your Email</label>
                <input className="form-input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>What's the issue?</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Describe what's happening…"
                  value={issue}
                  onChange={e => setIssue(e.target.value)}
                  required
                  style={{ resize: "vertical" }}
                />
              </div>
              {error && <p style={{ color: "#ef4444", fontSize: "0.875rem", marginBottom: 12 }}>{error}</p>}
              <button type="submit" className="btn btn-primary btn-full" disabled={sending}>
                {sending ? "Sending…" : "Send Message"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
