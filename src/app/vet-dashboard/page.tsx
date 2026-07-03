"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import SiteNav from "@/components/SiteNav";


interface User { id: string; email: string; name: string; role: string; }

interface Consultation {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  pet_name: string;
  pet_type: string;
  concern: string;
  date: string;
  time: string;
  status: string;
  payment_status: string;
  notes: string | null;
  amount_cents: number | null;
  stripe_payment_intent_id: string | null;
  completed_at: number | null;
  cancelled_at: number | null;
  is_guest?: number;
  unread_messages?: number;
}

interface SoapNotes {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface Message {
  id: string;
  sender_type: string;
  sender_id: string;
  text: string;
  created_at: number;
}

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
interface DaySchedule { enabled: boolean; start: string; end: string; }
type WeekSchedule = Record<DayKey, DaySchedule>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_SCHEDULE: WeekSchedule = {
  mon: { enabled: true, start: "17:30", end: "23:00" },
  tue: { enabled: true, start: "17:30", end: "23:00" },
  wed: { enabled: true, start: "17:30", end: "23:00" },
  thu: { enabled: true, start: "17:30", end: "23:00" },
  fri: { enabled: true, start: "17:30", end: "23:00" },
  sat: { enabled: true, start: "09:00", end: "23:00" },
  sun: { enabled: true, start: "09:00", end: "23:00" },
};

type Tab = "appointments" | "history" | "availability" | "settings";

function parseSoap(notes: string | null): SoapNotes {
  if (!notes) return { subjective: "", objective: "", assessment: "", plan: "" };
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object" && "subjective" in parsed) return parsed as SoapNotes;
  } catch { /* not JSON */ }
  // Plain text — put in plan
  return { subjective: "", objective: "", assessment: "", plan: notes };
}

function formatConsultDate(date: string, time: string): string {
  if (!date) return "TBD";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} at ${h12}:${String(m).padStart(2, "0")} ${ampm} EST`;
}

function isOverdue(date: string, time: string): boolean {
  const dt = new Date(`${date}T${time}:00`);
  return dt < new Date();
}

function getDateLabel(date: string): string {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function groupByDate(consultations: Consultation[]): { dateLabel: string; date: string; items: Consultation[] }[] {
  const map = new Map<string, Consultation[]>();
  for (const c of consultations) {
    const key = c.date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, dateLabel: getDateLabel(date), items }));
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "badge-pending",
    scheduled: "badge-pending",
    in_progress: "badge-in-progress",
    completed: "badge-completed",
    cancelled: "badge-cancelled",
  };
  return `badge ${map[status] || "badge-pending"}`;
}

export default function VetDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("appointments");

  function readTabFromUrl() {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && ["appointments", "history", "availability", "settings"].includes(t)) setTab(t);
  }

  // Read tab on mount and whenever the URL changes (e.g. My Profile nav link)
  useEffect(() => {
    readTabFromUrl();
    const onVetTab = (e: Event) => setTab((e as CustomEvent).detail as Tab);
    window.addEventListener("popstate", readTabFromUrl);
    window.addEventListener("vet-tab", onVetTab);
    return () => {
      window.removeEventListener("popstate", readTabFromUrl);
      window.removeEventListener("vet-tab", onVetTab);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [consultations, setConsultations] = useState<Consultation[]>([]);

  // Detail modal
  const [detailModal, setDetailModal] = useState<Consultation | null>(null);

  // SOAP modal
  const [soapModal, setSoapModal] = useState<{ id: string; soap: SoapNotes; markComplete: boolean } | null>(null);
  const [soapSaving, setSoapSaving] = useState(false);

  // Cancel confirm
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Patient history modal
  const [historyModal, setHistoryModal] = useState<{ petName: string; userId: string; items: Consultation[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // History tab search
  const [historySearch, setHistorySearch] = useState("");

  // Settings tab
  const [settingsForm, setSettingsForm] = useState({ name: "", email: "", phone: "", smsOptIn: false, smsConfirmed: false });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");

  // Availability
  const [schedule, setSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [availSaving, setAvailSaving] = useState(false);
  const [availMsg, setAvailMsg] = useState("");

  // Messages
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgOverlay, setMsgOverlay] = useState<Consultation | null>(null);
  const [overlayMessages, setOverlayMessages] = useState<Message[]>([]);
  const [overlayInput, setOverlayInput] = useState("");
  const [overlaySending, setOverlaySending] = useState(false);
  const overlayEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const routerRef = useRef(router);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        if (!d?.user) { routerRef.current.push("/vet-login"); return; }
        if (d.user.role !== "vet") { routerRef.current.push("/manage"); return; }
        setUser(d.user);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConsultations = useCallback(() => {
    fetch("/api/consultations")
      .then((r) => r.ok ? r.json() : { consultations: [] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => setConsultations(d.consultations || []));
  }, []);

  const fetchAvailability = useCallback(() => {
    fetch("/api/settings/availability")
      .then((r) => r.ok ? r.json() : {})
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        if (d.availability?.weeklySchedule) setSchedule(d.availability.weeklySchedule);
        if (d.availability?.blockedDates) setBlockedDates(d.availability.blockedDates);
      });
  }, []);

  const fetchVetSettings = useCallback(() => {
    fetch("/api/settings/vet")
      .then((r) => r.ok ? r.json() : {})
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const s = d.settings ?? {};
        setSettingsForm({
          name: s.name ?? "",
          email: s.email ?? "",
          phone: s.phone ?? "",
          smsOptIn: s.sms_opt_in === "1",
          smsConfirmed: s.sms_opt_in === "1",
        });
        setSettingsLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchConsultations();
    fetchAvailability();
    fetchVetSettings();
    const interval = setInterval(() => {
      fetchConsultations();
      if (activeConvo) fetchMessages(activeConvo);
      if (msgOverlay) fetchOverlayMessages(msgOverlay.id);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fetchConsultations, fetchAvailability, fetchVetSettings, activeConvo, msgOverlay]);

  async function fetchMessages(id: string) {
    const r = await fetch(`/api/consultations/${id}/messages`);
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await r.json();
      setMessages(d.messages || []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }

  async function fetchOverlayMessages(id: string) {
    const r = await fetch(`/api/consultations/${id}/messages`);
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await r.json();
      setOverlayMessages(d.messages || []);
      setTimeout(() => overlayEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function openMsgOverlay(c: Consultation) {
    setDetailModal(null);
    setMsgOverlay(c);
    fetchOverlayMessages(c.id);
  }

  async function sendOverlayMessage() {
    const text = overlayInput.trim();
    const convoId = msgOverlay?.id;
    if (!text || !convoId) return;
    setOverlaySending(true);
    try {
      const res = await fetch(`/api/consultations/${convoId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error ?? "Failed to send message");
        return;
      }
      setOverlayInput("");
      await fetchOverlayMessages(convoId);
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setOverlaySending(false);
    }
  }

  async function sendMessage() {
    const convoId = activeConvo;
    const text = msgInput.trim();
    if (!text || !convoId) return;
    setMsgSending(true);
    try {
      const res = await fetch(`/api/consultations/${convoId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error ?? "Failed to send message");
        return;
      }
      setMsgInput("");
      await fetchMessages(convoId);
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setMsgSending(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  async function resendVideoLink(id: string) {
    await fetch(`/api/consultations/${id}/resend-video-link`, { method: "POST" });
    alert("Video link resent to client.");
  }

  function openSoapModal(c: Consultation, markComplete: boolean) {
    setSoapModal({ id: c.id, soap: parseSoap(c.notes), markComplete });
    if (markComplete) setDetailModal(null);
  }

  async function saveSoap() {
    if (!soapModal) return;
    setSoapSaving(true);
    const notesJson = JSON.stringify(soapModal.soap);
    const body: Record<string, string> = { notes: notesJson };
    if (soapModal.markComplete) {
      body.status = "completed";
      body.completed_at = String(Math.floor(Date.now() / 1000));
    }
    await fetch(`/api/consultations/${soapModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSoapModal(null);
    setSoapSaving(false);
    fetchConsultations();
  }

  async function cancelConsultation(id: string) {
    setCancelLoading(true);
    const r = await fetch(`/api/consultations/${id}/cancel`, { method: "POST" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await r.json();
    setCancelLoading(false);
    setCancelConfirm(null);
    setDetailModal(null);
    alert(d.message || "Cancelled.");
    fetchConsultations();
  }

  async function openPatientHistory(c: Consultation) {
    setHistoryLoading(true);
    setHistoryModal({ petName: c.pet_name, userId: c.user_id, items: [] });
    // All consultations are already loaded — filter client-side
    const items = consultations.filter(x => x.user_id === c.user_id && x.pet_name === c.pet_name);
    setHistoryModal({ petName: c.pet_name, userId: c.user_id, items });
    setHistoryLoading(false);
  }

  async function saveVetSettings() {
    if (!settingsForm.name.trim() || !settingsForm.email.trim() || !settingsForm.phone.trim()) return;
    if (settingsForm.smsOptIn && !settingsForm.smsConfirmed) {
      alert("Please check the consent checkbox to enable SMS notifications.");
      return;
    }
    setSettingsSaving(true);
    setSettingsMsg("");
    const res = await fetch("/api/settings/vet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settingsForm.name.trim(),
        email: settingsForm.email.trim(),
        phone: settingsForm.phone.trim(),
        smsOptIn: settingsForm.smsOptIn && settingsForm.smsConfirmed,
      }),
    });
    setSettingsSaving(false);
    if (res.ok) {
      setSettingsMsg("Settings saved!");
      setTimeout(() => setSettingsMsg(""), 3000);
    } else {
      setSettingsMsg("Failed to save. Please try again.");
    }
  }

  async function saveAvailability() {
    setAvailSaving(true);
    setAvailMsg("");
    await fetch("/api/settings/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklySchedule: schedule, blockedDates }),
    });
    setAvailSaving(false);
    setAvailMsg("Availability saved!");
    setTimeout(() => setAvailMsg(""), 3000);
  }

  function addBlockDate() {
    if (!newBlockDate || blockedDates.includes(newBlockDate)) return;
    setBlockedDates([...blockedDates, newBlockDate].sort());
    setNewBlockDate("");
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  // Partition by terminal vs non-terminal status so EVERY consultation appears in exactly
  // one list — an allowlist here previously dropped valid statuses (e.g. "confirmed")
  // from both lists, making them invisible to the vet.
  const TERMINAL = ["completed", "cancelled"];
  const active = consultations.filter((c) => !TERMINAL.includes(c.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const pastConsultations = consultations.filter((c) => TERMINAL.includes(c.status))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  const filteredHistory = pastConsultations.filter((c) => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (c.pet_name || "").toLowerCase().includes(q)
      || (c.user_name || "").toLowerCase().includes(q)
      || (c.concern || "").toLowerCase().includes(q);
  });

  const grouped = groupByDate(active);

  const sidebarItems: { key: Tab; label: string; icon: string; badge?: number }[] = [
    { key: "appointments", label: "Appointments", icon: "📅", badge: active.length || undefined },
    { key: "history", label: "History", icon: "📋" },
    { key: "availability", label: "Availability", icon: "🗓" },
  ];

  return (
    <div className="dashboard-page">
      <SiteNav />
      <div className="dashboard-main">
        <div className="container">
          <div className="dashboard-layout">
            {/* Desktop tab strip */}
            <nav className="dashboard-nav-desktop">
              {sidebarItems.map((item) => (
                <button
                  key={item.key}
                  className={`dashboard-nav-desktop-btn${tab === item.key ? " active" : ""}`}
                  onClick={() => setTab(item.key)}
                  style={{ position: "relative" }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {item.badge ? (
                    <span style={{
                      position: "absolute", top: "4px", right: "6px",
                      background: "#dc3545", color: "#fff",
                      fontSize: "0.65rem", fontWeight: 700, padding: "1px 5px",
                      borderRadius: "10px", minWidth: "16px", textAlign: "center",
                      lineHeight: "1.4",
                    }}>
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>

            {/* Mobile pill nav */}
            <aside className="dashboard-sidebar three-col">
              {sidebarItems.map((item) => (
                <button
                  key={item.key}
                  className={`sidebar-btn${tab === item.key ? " active" : ""}`}
                  onClick={() => setTab(item.key)}
                  style={{ position: "relative" }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  {item.badge ? (
                    <span style={{
                      position: "absolute", top: "4px", right: "6px",
                      background: "#dc3545", color: "#fff",
                      fontSize: "0.65rem", fontWeight: 700, padding: "1px 5px",
                      borderRadius: "10px", minWidth: "16px", textAlign: "center",
                      lineHeight: "1.4",
                    }}>
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </aside>

            {/* Content */}
            <div className="dashboard-content">

              {/* ===== APPOINTMENTS ===== */}
              {tab === "appointments" && (
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", color: "#fff", margin: 0 }}>
                      Appointments
                    </h2>
                  </div>

                  {active.length === 0 ? (
                    <div className="empty-state">
                      <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📅</div>
                      <h3>No active consultations</h3>
                      <p>New bookings will appear here automatically.</p>
                    </div>
                  ) : (
                    grouped.map(({ dateLabel, date, items }) => (
                      <div key={date} style={{ marginBottom: "28px" }}>
                        <div style={{
                          fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: "0.08em", color: "#1a6a6a", marginBottom: "12px",
                          display: "flex", alignItems: "center", gap: "10px",
                        }}>
                          <span>{dateLabel}</span>
                          <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
                        </div>
                        {items.map((c) => {
                          const overdue = c.status === "scheduled" && isOverdue(c.date, c.time);
                          return (
                            <div key={c.id} className={`appt-card ${c.status.replace("_", "-")}`} style={{ marginBottom: "12px" }}>
                              <div className="appt-date">
                                <span className="date">{new Date(c.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                <span className="time">{(() => {
                                  const [h, m] = c.time.split(":").map(Number);
                                  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
                                })()}</span>
                              </div>
                              <div className="appt-info">
                                <h4>{c.pet_name} <span style={{ fontWeight: 400, fontSize: "0.85em", color: "#1a6a6a" }}>({c.pet_type})</span></h4>
                                <p style={{ fontSize: "0.875rem", color: "#1a6a6a", fontWeight: 600, margin: "2px 0 4px" }}>{c.user_name}</p>
                                <p style={{ fontSize: "0.9rem", color: "#333", margin: 0 }}>{c.concern}</p>
                                <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                  <span className={statusBadge(c.status)}>{c.status.replace(/_/g, " ")}</span>
                                  {overdue && <span className="badge" style={{ background: "#dc3545", color: "#fff" }}>Overdue</span>}
                                </div>
                              </div>
                              <div className="appt-actions">
                                <Link
                                  href={`/vet-dashboard/consultation/${c.id}`}
                                  className="btn btn-dark btn-small btn-view-details"
                                >
                                  View Details
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ===== HISTORY ===== */}
              {tab === "history" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", color: "#fff" }}>
                      Consultation History
                    </h2>
                  </div>

                  <div className="form-group" style={{ marginBottom: "24px" }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search by pet name, client, or concern…"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                  </div>

                  {filteredHistory.length === 0 ? (
                    <div className="empty-state">
                      <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📋</div>
                      <h3>{historySearch ? "No results found" : "No past consultations"}</h3>
                      <p>{historySearch ? "Try adjusting your search." : "Completed consultations will appear here."}</p>
                    </div>
                  ) : (
                    filteredHistory.map((c) => {
                      const soap = parseSoap(c.notes);
                      return (
                        <div key={c.id} className={`appt-card ${c.status}`} style={{ marginBottom: "12px" }}>
                          <div className="appt-date">
                            <span className="date">{new Date(c.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                            <span className="time">{(() => {
                              const [h, m] = c.time.split(":").map(Number);
                              return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
                            })()}</span>
                            <span style={{ fontSize: "0.75rem", color: "#1a6a6a" }}>
                              {new Date(c.date + "T00:00:00").getFullYear()}
                            </span>
                          </div>
                          <div className="appt-info">
                            <h4>{c.pet_name} <span style={{ fontWeight: 400, fontSize: "0.85em", color: "#1a6a6a" }}>({c.pet_type})</span></h4>
                            <p style={{ fontSize: "0.875rem", color: "#1a6a6a", fontWeight: 600, margin: "2px 0 4px" }}>{c.user_name}</p>
                            <p style={{ fontSize: "0.9rem", color: "#3d1c0a", margin: "0 0 8px" }}>{c.concern}</p>
                            {c.notes && (
                              <div style={{
                                background: "var(--color-cream)", borderRadius: "8px",
                                padding: "10px 14px", fontSize: "0.85rem", marginBottom: "8px",
                              }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                                  {["subjective", "objective", "assessment", "plan"].map((k) => (
                                    <div key={k}>
                                      <span style={{ fontWeight: 700, color: "#1a6a6a" }}>{k[0].toUpperCase()}: </span>
                                      <span style={{ color: soap[k as keyof SoapNotes] ? "#555" : "#bbb" }}>
                                        {soap[k as keyof SoapNotes] || "—"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <span className={statusBadge(c.status)}>{c.status}</span>
                          </div>
                          <div className="appt-actions">
                            <Link href={`/vet-dashboard/consultation/${c.id}`} className="btn btn-dark btn-small btn-view-details">
                              View Details
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ===== AVAILABILITY ===== */}
              {tab === "availability" && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", color: "#fff", marginBottom: "8px" }}>
                    Availability
                  </h2>
                  <p style={{ color: "rgba(255,255,255,0.75)", marginBottom: "28px", fontSize: "0.95rem" }}>
                    Set your weekly schedule and block specific dates.
                  </p>

                  <div style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: "12px", padding: "20px", boxShadow: "var(--shadow)", marginBottom: "24px" }}>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "#1a6a6a", marginBottom: "16px" }}>
                      Weekly Schedule
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {DAYS.map(({ key, label }) => (
                        <div key={key} style={{ padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", marginBottom: schedule[key].enabled ? "10px" : "0" }}>
                            <input
                              type="checkbox"
                              checked={schedule[key].enabled}
                              onChange={(e) => setSchedule({ ...schedule, [key]: { ...schedule[key], enabled: e.target.checked } })}
                              style={{ width: "18px", height: "18px", accentColor: "#5BC4C4", cursor: "pointer", flexShrink: 0 }}
                            />
                            <span style={{ fontWeight: 600, color: schedule[key].enabled ? "#1a6a6a" : "#aaa", fontSize: "0.9rem" }}>{label}</span>
                          </label>
                          {schedule[key].enabled ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "28px" }}>
                              <input type="time" className="form-input" style={{ flex: 1, padding: "6px 8px", fontSize: "0.85rem" }}
                                value={schedule[key].start}
                                onChange={(e) => setSchedule({ ...schedule, [key]: { ...schedule[key], start: e.target.value } })}
                              />
                              <span style={{ fontSize: "0.8rem", color: "#888", flexShrink: 0 }}>–</span>
                              <input type="time" className="form-input" style={{ flex: 1, padding: "6px 8px", fontSize: "0.85rem" }}
                                value={schedule[key].end}
                                onChange={(e) => setSchedule({ ...schedule, [key]: { ...schedule[key], end: e.target.value } })}
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: "12px", padding: "28px", boxShadow: "var(--shadow)", marginBottom: "24px" }}>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "#1a6a6a", marginBottom: "16px" }}>
                      Block Specific Dates
                    </h3>
                    <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
                      <input type="date" className="form-input" style={{ flex: 1, maxWidth: "220px" }}
                        value={newBlockDate} min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setNewBlockDate(e.target.value)}
                      />
                      <button className="btn btn-secondary btn-small" onClick={addBlockDate} disabled={!newBlockDate} style={{ whiteSpace: "nowrap" }}>
                        + Block Date
                      </button>
                    </div>
                    {blockedDates.length === 0 ? (
                      <p style={{ color: "#aaa", fontSize: "0.875rem" }}>No dates blocked.</p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {blockedDates.map((d) => (
                          <div key={d} style={{
                            display: "flex", alignItems: "center", gap: "8px",
                            background: "var(--color-cream-dark)", borderRadius: "8px", padding: "6px 12px", fontSize: "0.875rem",
                          }}>
                            <span style={{ fontWeight: 600, color: "#1a6a6a" }}>
                              {new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            <button onClick={() => setBlockedDates(blockedDates.filter((x) => x !== d))}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#dc3545", fontWeight: 700, fontSize: "1rem", padding: "0" }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {availMsg && <p style={{ color: "#28a745", fontWeight: 600, marginBottom: "12px" }}>{availMsg}</p>}
                  <button className="btn btn-primary" onClick={saveAvailability} disabled={availSaving}>
                    {availSaving ? "Saving…" : "Save Availability"}
                  </button>
                </div>
              )}

              {/* ===== SETTINGS ===== */}
              {tab === "settings" && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", color: "#fff", marginBottom: "8px" }}>
                    My Profile
                  </h2>
                  <p style={{ color: "rgba(255,255,255,0.75)", marginBottom: "28px", fontSize: "0.95rem" }}>
                    Manage your contact info and notification preferences.
                  </p>

                  {!settingsLoaded ? (
                    <p style={{ color: "#1a6a6a" }}>Loading…</p>
                  ) : (
                    <>
                      <div style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: "12px", padding: "28px", boxShadow: "var(--shadow)", marginBottom: "24px" }}>
                        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "#1a6a6a", marginBottom: "20px" }}>
                          Contact Information
                        </h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontWeight: 700, color: "#1a6a6a" }}>Name</label>
                            <input type="text" className="form-input" value={settingsForm.name}
                              onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontWeight: 700, color: "#1a6a6a" }}>Email</label>
                            <input type="email" className="form-input" value={settingsForm.email}
                              onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontWeight: 700, color: "#1a6a6a" }}>Phone Number</label>
                            <input type="tel" className="form-input" placeholder="(555) 123-4567" value={settingsForm.phone}
                              onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })} />
                          </div>
                        </div>
                      </div>

                      <div style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: "12px", padding: "28px", boxShadow: "var(--shadow)", marginBottom: "24px" }}>
                        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "#1a6a6a", marginBottom: "8px" }}>
                          SMS Notifications
                        </h3>
                        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "20px" }}>
                          Receive a text message when a new appointment is booked, starting, or cancelled.
                        </p>

                        <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", marginBottom: "20px" }}>
                          <input
                            type="checkbox"
                            checked={settingsForm.smsOptIn}
                            onChange={(e) => setSettingsForm({ ...settingsForm, smsOptIn: e.target.checked, smsConfirmed: e.target.checked ? settingsForm.smsConfirmed : false })}
                            style={{ width: "20px", height: "20px", marginTop: "2px", accentColor: "#5BC4C4", flexShrink: 0, cursor: "pointer" }}
                          />
                          <span style={{ fontSize: "0.95rem", color: "#1a6a6a", fontWeight: 600, lineHeight: 1.5 }}>
                            Enable SMS notifications to {settingsForm.phone || "my phone number above"}
                          </span>
                        </label>

                        {settingsForm.smsOptIn && (
                          <div style={{ background: "#f0f9f9", border: "1px solid rgba(91,196,196,0.4)", borderRadius: "10px", padding: "18px 20px" }}>
                            <p style={{ fontSize: "0.85rem", color: "#3d1c0a", lineHeight: 1.7, marginBottom: "14px" }}>
                              By checking the box below, I consent to receive automated text messages from Stockyard Animal Health
                              regarding new bookings, appointment reminders, and cancellations at the phone number provided.
                              Message and data rates may apply. Reply <strong>STOP</strong> at any time to opt out.
                            </p>
                            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={settingsForm.smsConfirmed}
                                onChange={(e) => setSettingsForm({ ...settingsForm, smsConfirmed: e.target.checked })}
                                style={{ width: "18px", height: "18px", marginTop: "2px", accentColor: "#5BC4C4", flexShrink: 0, cursor: "pointer" }}
                              />
                              <span style={{ fontSize: "0.85rem", color: "#1a6a6a", fontWeight: 600 }}>
                                I agree to receive SMS notifications from Stockyard Animal Health
                              </span>
                            </label>
                          </div>
                        )}

                      </div>

                      {settingsMsg && (
                        <p style={{ color: settingsMsg.includes("Failed") ? "#dc3545" : "#28a745", fontWeight: 600, marginBottom: "12px" }}>
                          {settingsMsg}
                        </p>
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={saveVetSettings}
                        disabled={settingsSaving || !settingsForm.name.trim() || !settingsForm.email.trim() || !settingsForm.phone.trim()}
                      >
                        {settingsSaving ? "Saving…" : "Save Settings"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ===== MESSAGES ===== */}
            </div>
          </div>
        </div>
      </div>


      {/* ===== SOAP NOTES MODAL ===== */}
      {soapModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSoapModal(null); }}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "860px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ background: "linear-gradient(135deg, #1a6a6a 0%, #5BC4C4 100%)", color: "#fff", padding: "20px 28px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{soapModal.markComplete ? "Complete Consultation — SOAP Notes" : "Edit SOAP Notes"}</h3>
              <button onClick={() => setSoapModal(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: "1.5rem", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ padding: "24px 28px" }}>
              {(["subjective", "objective", "assessment", "plan"] as (keyof SoapNotes)[]).map((k) => (
                <div className="form-group" key={k}>
                  <label style={{ fontWeight: 700, color: "#1a6a6a", textTransform: "capitalize" }}>
                    <span style={{ fontSize: "1.1rem" }}>{k[0].toUpperCase()}</span>{k.slice(1)}
                    {k === "subjective" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Patient history & owner report</span>}
                    {k === "objective" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Observations & findings</span>}
                    {k === "assessment" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Diagnosis / differential</span>}
                    {k === "plan" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Treatment & follow-up</span>}
                  </label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={soapModal.soap[k]}
                    onChange={(e) => setSoapModal({ ...soapModal, soap: { ...soapModal.soap, [k]: e.target.value } })}
                    placeholder={
                      k === "subjective" ? "Owner reports…" :
                      k === "objective" ? "On video observation…" :
                      k === "assessment" ? "Working diagnosis…" :
                      "Treatment plan, prescriptions, follow-up…"
                    }
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-small" onClick={() => setSoapModal(null)} disabled={soapSaving}>Cancel</button>
                <button
                  className="btn btn-primary btn-small"
                  onClick={saveSoap}
                  disabled={soapSaving}
                  style={{ background: soapModal.markComplete ? "#E8427A" : undefined, borderColor: soapModal.markComplete ? "#E8427A" : undefined }}
                >
                  {soapSaving ? "Saving…" : soapModal.markComplete ? "Mark Complete & Save" : "Save Notes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== CANCEL CONFIRM MODAL ===== */}
      {cancelConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "32px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h3 style={{ color: "#dc3545", marginBottom: "12px", fontFamily: "var(--font-display)" }}>Cancel Consultation?</h3>
            <p style={{ color: "#3d1c0a", marginBottom: "24px", lineHeight: 1.6 }}>
              This will cancel the consultation and issue a full refund to the client if payment was collected. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-small" onClick={() => setCancelConfirm(null)} disabled={cancelLoading}>Keep</button>
              <button
                className="btn btn-small"
                style={{ background: "#dc3545", color: "#fff", border: "none" }}
                onClick={() => cancelConsultation(cancelConfirm)}
                disabled={cancelLoading}
              >
                {cancelLoading ? "Cancelling…" : "Yes, Cancel & Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MESSAGING OVERLAY ===== */}
      {msgOverlay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setMsgOverlay(null); }}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "600px", height: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ background: "#1a6a6a", color: "#fff", padding: "18px 24px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>💬 {msgOverlay.pet_name}</div>
                <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>{msgOverlay.user_name}</div>
              </div>
              <button onClick={() => setMsgOverlay(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: "1.5rem", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px", background: "#fafaf8", display: "flex", flexDirection: "column" }}>
              {overlayMessages.length === 0 ? (
                <p style={{ textAlign: "center", color: "#1a6a6a", marginTop: "40px" }}>No messages yet. Send the first message!</p>
              ) : (
                overlayMessages.map((m) => (
                  <div key={m.id} className={`message-bubble ${m.sender_type === "vet" ? "vet" : "customer"}`}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "4px", opacity: 0.8 }}>
                      {m.sender_type === "vet" ? "Dr. McMillen" : msgOverlay.user_name}
                    </div>
                    <div style={{ fontSize: "0.95rem", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                    <div style={{ fontSize: "0.7rem", marginTop: "6px", opacity: 0.6, textAlign: "right" }}>
                      {new Date(m.created_at * 1000).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}
                    </div>
                  </div>
                ))
              )}
              <div ref={overlayEndRef} />
            </div>
            <div style={{ display: "flex", gap: "12px", padding: "16px 20px", borderTop: "1px solid var(--color-border)" }}>
              <textarea
                style={{ flex: 1, border: "2px solid var(--color-border)", borderRadius: "12px", padding: "12px 14px", fontSize: "0.95rem", resize: "none", fontFamily: "inherit" }}
                rows={2}
                placeholder="Type a message…"
                value={overlayInput}
                onChange={(e) => setOverlayInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendOverlayMessage(); } }}
              />
              <button type="button" className="btn btn-primary btn-small" style={{ alignSelf: "flex-end", padding: "12px 20px" }}
                onClick={sendOverlayMessage} disabled={overlaySending || !overlayInput.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PATIENT HISTORY MODAL ===== */}
      {historyModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setHistoryModal(null); }}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "640px", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ background: "#1a6a6a", color: "#fff", padding: "20px 28px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>Patient History</h3>
                <p style={{ margin: "4px 0 0", opacity: 0.8, fontSize: "0.9rem" }}>{historyModal.petName}</p>
              </div>
              <button onClick={() => setHistoryModal(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: "1.5rem", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ padding: "24px 28px" }}>
              {historyLoading ? (
                <p style={{ color: "#1a6a6a", textAlign: "center" }}>Loading…</p>
              ) : historyModal.items.length === 0 ? (
                <div className="empty-state">
                  <h3>No history found</h3>
                  <p>No previous consultations found for {historyModal.petName}.</p>
                </div>
              ) : (
                <>
                  <p style={{ marginBottom: "16px", color: "#666", fontSize: "0.9rem" }}>
                    <strong>{historyModal.items.length}</strong> consultation{historyModal.items.length !== 1 ? "s" : ""} on record
                  </p>
                  {historyModal.items
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((c) => {
                      const soap = parseSoap(c.notes);
                      return (
                        <div key={c.id} style={{ border: "1px solid var(--color-border)", borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <div>
                              <div style={{ fontWeight: 700, color: "#1a6a6a" }}>
                                {new Date(c.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                              </div>
                              <div style={{ fontSize: "0.8rem", color: "#1a6a6a" }}>{(() => {
                                const [h, m] = c.time.split(":").map(Number);
                                return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
                              })()}</div>
                            </div>
                            <span className={statusBadge(c.status)}>{c.status}</span>
                          </div>
                          <div style={{ marginBottom: "10px" }}>
                            <div style={{ fontSize: "0.75rem", color: "#1a6a6a", marginBottom: "2px" }}>Concern</div>
                            <div style={{ fontSize: "0.9rem", color: "#1a6a6a" }}>{c.concern}</div>
                          </div>
                          {c.notes && (
                            <div style={{ background: "var(--color-cream)", borderRadius: "8px", padding: "10px 14px" }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1a6a6a", marginBottom: "6px" }}>SOAP Notes</div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "0.85rem" }}>
                                {(["subjective", "objective", "assessment", "plan"] as (keyof SoapNotes)[]).map((k) => (
                                  soap[k] ? (
                                    <div key={k}>
                                      <span style={{ fontWeight: 700, color: "#1a6a6a" }}>{k[0].toUpperCase()}: </span>
                                      <span style={{ color: "#3d1c0a" }}>{soap[k]}</span>
                                    </div>
                                  ) : null
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ background: "transparent", color: "#1a6a6a", padding: "20px 0", textAlign: "center" }}>
        <p style={{ opacity: 0.7, fontSize: "0.9rem", marginBottom: "12px" }}>
          &copy; 2026 Stockyard Animal Health
        </p>
        <Link
          href="/admin"
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "8px 20px", borderRadius: "8px",
            background: "rgba(91,196,196,0.12)", border: "1px solid rgba(91,196,196,0.35)",
            color: "#1a6a6a", fontSize: "0.82rem", fontWeight: 600,
            textDecoration: "none",
          }}
        >
          🗄️ Database Admin
        </Link>
      </footer>

    </div>
  );
}
