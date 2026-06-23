"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type TableName = "consultations" | "users" | "pets" | "messages" | "promo_codes" | "settings" | "sessions";

const TABLES: { key: TableName; label: string; icon: string }[] = [
  { key: "consultations", label: "Consultations", icon: "📋" },
  { key: "users",         label: "Users",          icon: "👤" },
  { key: "pets",          label: "Pets",            icon: "🐾" },
  { key: "messages",      label: "Messages",        icon: "💬" },
  { key: "promo_codes",   label: "Promo Codes",     icon: "🏷️" },
  { key: "settings",      label: "Settings",        icon: "⚙️" },
  { key: "sessions",      label: "Sessions",        icon: "🔑" },
];

// Columns to show per table (ordered, human-readable labels)
const COLUMNS: Record<TableName, { key: string; label: string; type?: "ts" | "cents" | "bool" | "json" | "status" | "truncate" }[]> = {
  consultations: [
    { key: "id",                     label: "ID",              type: "truncate" },
    { key: "user_name",              label: "Client" },
    { key: "user_email",             label: "Email" },
    { key: "user_phone",             label: "Phone" },
    { key: "pet_name",               label: "Pet" },
    { key: "pet_type",               label: "Type" },
    { key: "date",                   label: "Date" },
    { key: "time",                   label: "Time" },
    { key: "status",                 label: "Status",          type: "status" },
    { key: "payment_status",         label: "Payment",         type: "status" },
    { key: "amount_cents",           label: "Amount",          type: "cents" },
    { key: "promo_code",             label: "Promo" },
    { key: "promo_discount",         label: "Discount" },
    { key: "concern",                label: "Concern",         type: "truncate" },
    { key: "notes",                  label: "SOAP Notes",      type: "truncate" },
    { key: "ai_summary",             label: "AI Summary",      type: "truncate" },
    { key: "ai_summary_approved",    label: "AI Approved",     type: "bool" },
    { key: "discharge_sent",         label: "Discharge Sent",  type: "bool" },
    { key: "discharge_sent_at",      label: "Discharge At",    type: "ts" },
    { key: "agreements_client_name", label: "Agreed By" },
    { key: "agreements_signed_at",   label: "Agreed At",       type: "ts" },
    { key: "agreements_json",        label: "Agreements",      type: "json" },
    { key: "stripe_payment_intent_id", label: "Stripe PI",     type: "truncate" },
    { key: "stripe_refund_id",       label: "Refund ID",       type: "truncate" },
    { key: "cancelled_at",           label: "Cancelled At",    type: "ts" },
    { key: "cancelled_by",           label: "Cancelled By" },
    { key: "completed_at",           label: "Completed At",    type: "ts" },
    { key: "created_at",             label: "Created",         type: "ts" },
    { key: "updated_at",             label: "Updated",         type: "ts" },
  ],
  users: [
    { key: "id",                label: "ID",         type: "truncate" },
    { key: "name",              label: "Name" },
    { key: "email",             label: "Email" },
    { key: "phone",             label: "Phone" },
    { key: "address",           label: "Address" },
    { key: "city",              label: "City" },
    { key: "state",             label: "State" },
    { key: "zip",               label: "ZIP" },
    { key: "role",              label: "Role",       type: "status" },
    { key: "stripe_customer_id", label: "Stripe ID", type: "truncate" },
    { key: "created_at",        label: "Joined",     type: "ts" },
    { key: "updated_at",        label: "Updated",    type: "ts" },
  ],
  pets: [
    { key: "id",               label: "ID",           type: "truncate" },
    { key: "name",             label: "Name" },
    { key: "type",             label: "Type" },
    { key: "breed",            label: "Breed" },
    { key: "weight",           label: "Weight (lbs)" },
    { key: "birthday_year",    label: "Birth Year" },
    { key: "birthday_month",   label: "Birth Month" },
    { key: "birthday_day",     label: "Birth Day" },
    { key: "estimated_birthday", label: "Est. Birthday", type: "bool" },
    { key: "notes",            label: "Notes",        type: "truncate" },
    { key: "owner_name",       label: "Owner" },
    { key: "owner_email",      label: "Owner Email" },
    { key: "created_at",       label: "Added",        type: "ts" },
  ],
  messages: [
    { key: "id",              label: "ID",           type: "truncate" },
    { key: "consultation_id", label: "Consult ID",   type: "truncate" },
    { key: "pet_name",        label: "Pet" },
    { key: "user_name",       label: "Client" },
    { key: "sender_type",     label: "Sender",       type: "status" },
    { key: "text",            label: "Message",      type: "truncate" },
    { key: "read_by_vet",     label: "Read (Vet)",   type: "bool" },
    { key: "read_by_customer",label: "Read (Client)",type: "bool" },
    { key: "created_at",      label: "Sent",         type: "ts" },
  ],
  promo_codes: [
    { key: "code",        label: "Code" },
    { key: "discount",    label: "Discount" },
    { key: "type",        label: "Type",   type: "status" },
    { key: "description", label: "Description" },
    { key: "active",      label: "Active", type: "bool" },
    { key: "created_at",  label: "Created", type: "ts" },
  ],
  settings: [
    { key: "key",        label: "Key" },
    { key: "value",      label: "Value" },
    { key: "updated_at", label: "Updated", type: "ts" },
  ],
  sessions: [
    { key: "id",         label: "Session ID",  type: "truncate" },
    { key: "user_id",    label: "User ID",     type: "truncate" },
    { key: "name",       label: "Name" },
    { key: "email",      label: "Email" },
    { key: "expires_at", label: "Expires",     type: "ts" },
    { key: "created_at", label: "Created",     type: "ts" },
  ],
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:     { bg: "#fff3cd", color: "#856404" },
  scheduled:   { bg: "#cfe2ff", color: "#084298" },
  in_progress: { bg: "#d1ecf1", color: "#0c5460" },
  completed:   { bg: "#d1e7dd", color: "#0a3622" },
  cancelled:   { bg: "#f8d7da", color: "#842029" },
  paid:        { bg: "#d1e7dd", color: "#0a3622" },
  unpaid:      { bg: "#f8d7da", color: "#842029" },
  refunded:    { bg: "#e2d9f3", color: "#432874" },
  vet:         { bg: "#cfe2ff", color: "#084298" },
  customer:    { bg: "#d1ecf1", color: "#0c5460" },
  percent:     { bg: "#d1e7dd", color: "#0a3622" },
  fixed:       { bg: "#cfe2ff", color: "#084298" },
};

function fmt(value: unknown, type?: string): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span style={{ color: "#ccc" }}>—</span>;

  if (type === "ts") {
    const n = Number(value);
    if (!n) return <span style={{ color: "#ccc" }}>—</span>;
    return <span style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>{new Date(n * 1000).toLocaleString()}</span>;
  }
  if (type === "cents") {
    const n = Number(value);
    return n === 0 ? <span style={{ color: "#28a745", fontWeight: 600 }}>Free</span> : <span>${(n / 100).toFixed(2)}</span>;
  }
  if (type === "bool") {
    return value ? <span style={{ color: "#28a745", fontWeight: 700 }}>✓</span> : <span style={{ color: "#dc3545" }}>✗</span>;
  }
  if (type === "status") {
    const s = String(value);
    const c = STATUS_COLORS[s] ?? { bg: "#f0f0f0", color: "#555" };
    return (
      <span style={{
        background: c.bg, color: c.color,
        padding: "2px 8px", borderRadius: "999px",
        fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap",
      }}>
        {s.replace(/_/g, " ")}
      </span>
    );
  }
  if (type === "json") {
    try {
      const parsed = JSON.parse(String(value));
      const agreed = Object.entries(parsed as Record<string, boolean>)
        .filter(([, v]) => v).map(([k]) => k);
      return (
        <span style={{ fontSize: "0.75rem", color: "#1a6a6a" }}>
          {agreed.length}/9 agreements
        </span>
      );
    } catch {
      return <span style={{ fontSize: "0.75rem", color: "#999" }}>invalid</span>;
    }
  }
  if (type === "truncate") {
    const s = String(value);
    return (
      <span title={s} style={{ maxWidth: "180px", display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>
        {s}
      </span>
    );
  }
  return String(value);
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState<TableName>("consultations");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [expandedRow, setExpandedRow] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then((d: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!d?.user || d.user.role !== "vet") { router.push("/vet-login"); return; }
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTable = useCallback(async (t: TableName) => {
    setFetching(true);
    setSearch("");
    setExpandedRow(null);
    const r = await fetch(`/api/admin?table=${t}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await r.json();
    setRows(d.rows ?? []);
    setFetching(false);
  }, []);

  useEffect(() => { if (!loading) loadTable(activeTable); }, [loading, activeTable, loadTable]);

  const columns = COLUMNS[activeTable];
  const q = search.toLowerCase();
  const filtered = q
    ? rows.filter(row =>
        columns.some(col => {
          const v = row[col.key];
          return v != null && String(v).toLowerCase().includes(q);
        })
      )
    : rows;

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-cream)" }}>
      <p>Checking access…</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f4", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a6a6a 0%, #5BC4C4 100%)", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#fff", fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 800 }}>
            Admin — Database Viewer
          </h1>
          <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.8)", fontSize: "0.85rem" }}>
            Stockyard Animal Health LLC · Read-only data view
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/vet-dashboard" className="btn btn-secondary btn-small" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
            ← Vet Dashboard
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 80px)" }}>
        {/* Sidebar */}
        <div style={{ width: "200px", flexShrink: 0, background: "#fff", borderRight: "1px solid #e0e8e8", padding: "16px 0" }}>
          {TABLES.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTable(t.key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 20px", border: "none", background: activeTable === t.key ? "#f0f9f9" : "transparent",
                borderLeft: activeTable === t.key ? "3px solid #5BC4C4" : "3px solid transparent",
                color: activeTable === t.key ? "#1a6a6a" : "#555",
                fontWeight: activeTable === t.key ? 700 : 400,
                fontSize: "0.9rem", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)",
                transition: "all 0.15s",
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, color: "#1a6a6a", fontSize: "1.1rem", fontWeight: 700 }}>
                {TABLES.find(t => t.key === activeTable)?.icon} {TABLES.find(t => t.key === activeTable)?.label}
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#888" }}>
                {filtered.length} {filtered.length !== rows.length ? `of ${rows.length} ` : ""}row{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  border: "1.5px solid #d0e8e8", borderRadius: "8px", padding: "8px 14px",
                  fontSize: "0.875rem", fontFamily: "var(--font-body)", width: "220px", outline: "none",
                }}
              />
              <button
                onClick={() => loadTable(activeTable)}
                style={{ background: "#f0f9f9", border: "1.5px solid #d0e8e8", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "0.875rem", color: "#1a6a6a", fontWeight: 600 }}
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {fetching ? (
            <div style={{ textAlign: "center", padding: "60px", color: "#888" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", color: "#bbb" }}>No records found.</div>
          ) : (
            <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "#1a6a6a" }}>
                      {columns.map(col => (
                        <th key={col.key} style={{ padding: "11px 14px", color: "#fff", textAlign: "left", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                          {col.label}
                        </th>
                      ))}
                      <th style={{ padding: "11px 14px", color: "#fff", fontSize: "0.75rem" }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr
                        key={i}
                        style={{ background: i % 2 === 0 ? "#fff" : "#f8fbfb", borderBottom: "1px solid #eef4f4", cursor: "pointer" }}
                        onClick={() => setExpandedRow(expandedRow === row ? null : row)}
                      >
                        {columns.map(col => (
                          <td key={col.key} style={{ padding: "10px 14px", color: "#333", maxWidth: "200px" }}>
                            {fmt(row[col.key], col.type)}
                          </td>
                        ))}
                        <td style={{ padding: "10px 14px" }}>
                          <button
                            onClick={e => { e.stopPropagation(); setExpandedRow(expandedRow === row ? null : row); }}
                            style={{ background: "#f0f9f9", border: "1px solid #d0e8e8", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "0.75rem", color: "#1a6a6a", fontWeight: 600 }}
                          >
                            {expandedRow === row ? "Close" : "View"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row detail drawer */}
      {expandedRow && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", justifyContent: "flex-end" }}
          onClick={() => setExpandedRow(null)}
        >
          <div
            style={{ width: "min(520px, 95vw)", background: "#fff", height: "100%", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ background: "linear-gradient(135deg, #1a6a6a 0%, #5BC4C4 100%)", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: "1rem" }}>
                {TABLES.find(t => t.key === activeTable)?.label} Detail
              </h3>
              <button onClick={() => setExpandedRow(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {columns.map(col => {
                const raw = expandedRow[col.key];
                if (raw === null || raw === undefined || raw === "") return null;
                return (
                  <div key={col.key} style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5BC4C4", marginBottom: "4px" }}>
                      {col.label}
                    </div>
                    {col.type === "json" ? (
                      (() => {
                        try {
                          const parsed = JSON.parse(String(raw)) as Record<string, boolean>;
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {Object.entries(parsed).map(([k, v]) => (
                                <div key={k} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }}>
                                  <span style={{ color: v ? "#28a745" : "#dc3545", fontWeight: 700 }}>{v ? "✓" : "✗"}</span>
                                  <span style={{ color: "#444" }}>{k}</span>
                                </div>
                              ))}
                            </div>
                          );
                        } catch {
                          return <pre style={{ fontSize: "0.78rem", background: "#f8f8f8", padding: "10px", borderRadius: "6px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{String(raw)}</pre>;
                        }
                      })()
                    ) : col.type === "truncate" || (typeof raw === "string" && raw.length > 80) ? (
                      <div style={{ fontSize: "0.875rem", color: "#333", lineHeight: 1.6, background: "#f8fbfb", borderRadius: "6px", padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {String(raw)}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.875rem", color: "#333" }}>
                        {fmt(raw, col.type)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
