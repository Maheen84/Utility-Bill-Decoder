"use client";

import { useState } from "react";

type Line = { type: string; amount: number };
type Bill = {
  provider: string | null;
  tariff: string | null;
  sanctioned_load_kw: number | null;
  bill_month: string | null;
  reading_date: string | null;
  issue_date: string | null;
  due_date: string | null;
  previous_reading: number | null;
  current_reading: number | null;
  units_consumed: number | null;
  charges: Line[];
  total_charges: number | null;
  taxes: Line[];
  total_taxes: number | null;
  current_bill: number | null;
  arrears: number | null;
  payable_within_due_date: number | null;
  payable_after_due_date: number | null;
};
type HistoryRow = {
  month: string;
  units: number | null;
  billed_amount: number | null;
  payment_amount: number | null;
  is_current_month: boolean;
};
type Result = { bill: Bill | null; history: HistoryRow[]; errors: { bill: string | null; history: string | null } };

const pkr = (n: number | null) => (n === null ? "—" : `PKR ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const val = (v: string | number | null) => (v === null ? "—" : String(v));
const label = (s: string) => s.replace(/_/g, " ");

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e3e6ea", borderRadius: 12, padding: 20, marginBottom: 20,
};
const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", color: "#555", fontWeight: 600, borderBottom: "1px solid #e3e6ea" };
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #f0f1f3" };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [askError, setAskError] = useState<string | null>(null);

  function pick(f: File | null) {
    setFile(f);
    setResult(null);
    setError(null);
    setQa([]);
    setAskError(null);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }
    async function ask(q: string) {
    if (!file || !result?.bill || !q.trim() || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("question", q.trim());
      form.append("bill", JSON.stringify(result.bill));
      form.append("history", JSON.stringify(result.history));
      const res = await fetch("/api/ask", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setQa((prev) => [...prev, { q: q.trim(), a: data.answer }]);
      setQuestion("");
    } catch (e: any) {
      setAskError(e.message ?? "Something went wrong.");
    } finally {
      setAsking(false);
    }
  }

  const bill = result?.bill ?? null;
  const maxUnits = Math.max(1, ...(result?.history ?? []).map((h) => h.units ?? 0));

  return (
    <main style={{ background: "#f5f6f8", color: "#1a1d21", minHeight: "100vh", padding: "32px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 4px" }}>Utility Bill Decoder</h1>
        <p style={{ margin: "0 0 24px", color: "#555" }}>
          Upload an electricity bill (K-Electric, LESCO or IESCO) to see its details in plain language.
        </p>

        <div style={card}>
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected bill" style={{ display: "block", maxWidth: "100%", maxHeight: 360, marginTop: 16, borderRadius: 8, border: "1px solid #e3e6ea" }} />
          )}
          <button
            onClick={analyze}
            disabled={!file || loading}
            style={{ marginTop: 16, padding: "10px 20px", borderRadius: 8, border: "none", background: !file || loading ? "#9aa5b1" : "#1d4ed8", color: "#fff", fontSize: 15, cursor: !file || loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Reading your bill… (10–20 seconds)" : "Analyze bill"}
          </button>
          {error && <p style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p>}
        </div>

        {result && result.errors.bill && (
          <p style={{ color: "#b91c1c" }}>Could not read the bill details: {result.errors.bill}</p>
        )}

        {bill && (
          <>
            <div style={card}>
              <h2 style={{ marginTop: 0 }}>Summary</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {[
                  ["Provider", val(bill.provider)],
                  ["Tariff", val(bill.tariff)],
                  ["Bill month", val(bill.bill_month)],
                  ["Sanctioned load", bill.sanctioned_load_kw === null ? "—" : `${bill.sanctioned_load_kw} kW`],
                  ["Meter reading", bill.previous_reading === null ? "—" : `${bill.previous_reading} → ${bill.current_reading}`],
                  ["Units consumed", val(bill.units_consumed)],
                  ["Reading date", val(bill.reading_date)],
                  ["Issue date", val(bill.issue_date)],
                  ["Due date", val(bill.due_date)],
                  ["Current bill", pkr(bill.current_bill)],
                  ["Arrears", pkr(bill.arrears)],
                  ["Pay by due date", pkr(bill.payable_within_due_date)],
                  ["Pay after due date", pkr(bill.payable_after_due_date)],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "#f5f6f8", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, color: "#555" }}>{k}</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
              <div style={card}>
                <h2 style={{ marginTop: 0 }}>Charges</h2>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead><tr><th style={th}>Type</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {bill.charges.length === 0 && <tr><td style={td} colSpan={2}>No itemized charges on this bill</td></tr>}
                    {bill.charges.map((c, i) => (
                      <tr key={i}><td style={td}>{label(c.type)}</td><td style={{ ...td, textAlign: "right" }}>{pkr(c.amount)}</td></tr>
                    ))}
                    <tr><td style={{ ...td, fontWeight: 700 }}>Total charges</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{pkr(bill.total_charges)}</td></tr>
                  </tbody>
                </table>
              </div>

              <div style={card}>
                <h2 style={{ marginTop: 0 }}>Taxes</h2>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead><tr><th style={th}>Type</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {bill.taxes.length === 0 && <tr><td style={td} colSpan={2}>No itemized taxes on this bill</td></tr>}
                    {bill.taxes.map((t, i) => (
                      <tr key={i}><td style={td}>{label(t.type)}</td><td style={{ ...td, textAlign: "right" }}>{pkr(t.amount)}</td></tr>
                    ))}
                    <tr><td style={{ ...td, fontWeight: 700 }}>Total taxes</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{pkr(bill.total_taxes)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {result && result.history.length > 0 && (
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Usage history</h2>
            {result.history.map((h) => (
              <div key={h.month} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 4 }}>
                <span style={{ width: 64, color: "#555" }}>{h.month}</span>
                <div style={{ flex: 1, background: "#eef0f3", borderRadius: 4, height: 14 }}>
                  <div style={{ width: `${((h.units ?? 0) / maxUnits) * 100}%`, height: "100%", borderRadius: 4, background: h.is_current_month ? "#1d4ed8" : "#94a3b8" }} />
                </div>
                <span style={{ width: 90, textAlign: "right" }}>{h.units === null ? "—" : `${h.units} units`}</span>
              </div>
            ))}
          </div>
        )}
                {bill && (
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Ask about this bill</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {[
                "How much of my bill is taxes?",
                "Why is my bill higher than usual?",
                "What is the late payment cost?",
                "What was my average monthly usage?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={asking}
                  style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #cbd2d9", background: "#fff", color: "#1a1d21", fontSize: 13, cursor: asking ? "not-allowed" : "pointer" }}
                >
                  {s}
                </button>
              ))}
            </div>

            {qa.map((item, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600 }}>{item.q}</div>
                <div style={{ background: "#f5f6f8", borderRadius: 8, padding: "10px 12px", marginTop: 4, lineHeight: 1.5 }}>{item.a}</div>
              </div>
            ))}
            {asking && <p style={{ color: "#555" }}>Thinking…</p>}
            {askError && <p style={{ color: "#b91c1c" }}>{askError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask(question)}
                placeholder="Type your own question…"
                maxLength={500}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd2d9", background: "#fff", color: "#1a1d21", fontSize: 15 }}
              />
              <button
                onClick={() => ask(question)}
                disabled={asking || !question.trim()}
                style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: asking || !question.trim() ? "#9aa5b1" : "#1d4ed8", color: "#fff", fontSize: 15, cursor: asking || !question.trim() ? "not-allowed" : "pointer" }}
              >
                Ask
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}