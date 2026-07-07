"use client";

import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <h3>Stockyard Animal Health</h3>
            <p>
              Professional veterinary consultations for farm animals and companion animals
              throughout Florida.
            </p>
          </div>
          <div className="footer-links">
            <h4>For Emergencies</h4>
            <p style={{ fontSize: "0.82rem", lineHeight: 1.6, margin: "0 0 6px 0" }}>
              Telehealth is not for emergencies. If your animal needs urgent care, contact:
            </p>
            <ul style={{ columns: 1, fontSize: "0.82rem", lineHeight: 1.7 }}>
              <li>
                <strong>UF Small Animal Hospital</strong><br />
                <a href="tel:3523922235">(352) 392-2235</a>
              </li>
              <li>
                <strong>UF Large Animal Hospital</strong><br />
                <a href="tel:3523922229">(352) 392-2229</a>
              </li>
              <li style={{ color: "rgba(255,255,255,0.65)" }}>
                2089 SW 16th Ave, Gainesville, FL
              </li>
            </ul>
          </div>
          <div className="footer-links">
            <h4>Quick Links</h4>
            <ul style={{ columns: 1 }}>
              <li>
                <Link href="/about">About Dr. McMillen</Link>
              </li>
              <li>
                <Link href="/privacy-policy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms">Terms and Conditions</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Stockyard Animal Health. All rights reserved.</p>
          <div className="footer-auth-links">
            <Link href="/vet-login" className="footer-vet-link">
              Vet Portal
            </Link>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: "12px" }}>
          <a
            href="https://theweekendweb.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.5)",
              textDecoration: "none",
            }}
          >
            <span>Powered By</span>
            <span style={{ fontFamily: "monospace" }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>&lt;</span>
              <span style={{ color: "#a78bfa" }}>tww</span>
              <span style={{ color: "#22d3ee" }}>/</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>&gt;</span>
            </span>
            <span>The Weekend Web</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
