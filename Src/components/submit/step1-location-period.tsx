import { useState, useEffect } from "react";
import { supabase, FULL_MONTHS } from "@/lib/supabase";

interface Props {
  selection: any;
  onComplete: (selection: any) => void;
}

export default function Step1LocationPeriod({ selection, onComplete }: Props) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const now = new Date();
  const [form, setForm] = useState(selection || {
    supplier_id: "", country_id: "", location_id: "",
    month: now.getMonth() + 1, year: now.getFullYear(), submitter: ""
  });

  useEffect(() => {
    supabase.from("suppliers").select("id,name,business_type").eq("status", "active").order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  useEffect(() => {
    if (form.supplier_id) {
      supabase.from("countries").select("id,country_name").eq("supplier_id", form.supplier_id).order("country_name")
        .then(({ data }) => setCountries(data || []));
    }
  }, [form.supplier_id]);

  useEffect(() => {
    if (form.country_id) {
      supabase.from("locations").select("id,name").eq("country_id", form.country_id).eq("status", "active").order("name")
        .then(({ data }) => setLocations(data || []));
    }
  }, [form.country_id]);

  const canContinue = form.supplier_id && form.country_id && form.location_id && form.month && form.year && form.submitter.trim();

  return (
    <div style={{ maxWidth: 620 }}>
      <style>{`
        .s1-card { background:#fff; border:1px solid #E2E8F0; border-radius:12px; padding:28px; box-shadow:0 1px 3px rgba(15,27,45,0.06); }
        .s1-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        @media(max-width:580px){.s1-grid{grid-template-columns:1fr;}}
        .s1-field { display:flex; flex-direction:column; gap:6px; }
        .s1-field label { font-size:12px; font-weight:700; color:#475569; letter-spacing:0.03em; text-transform:uppercase; }
        .s1-field input,.s1-field select {
          height:40px; padding:0 14px; border:1.5px solid #CBD5E1; border-radius:8px;
          font-size:14px; color:#0F1B2D; background:#fff; outline:none;
          transition:border-color 0.15s,box-shadow 0.15s; font-family:'DM Sans',sans-serif; width:100%;
        }
        .s1-field select {
          appearance:none; -webkit-appearance:none; cursor:pointer; padding-right:36px;
          background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center;
        }
        .s1-field input:focus,.s1-field select:focus { border-color:#2563EB; box-shadow:0 0 0 3px rgba(37,99,235,0.12); }
        .s1-field select:disabled { background:#F8FAFC; color:#94A3B8; cursor:not-allowed; }
        .s1-divider { border:none; border-top:1px solid #F1F5F9; margin:20px 0; }
        .s1-footer { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
        .s1-btn { height:42px; padding:0 24px; background:#059669; color:#fff; border:none; border-radius:9px; font-size:14px; font-weight:600; cursor:pointer; transition:background 0.15s; font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:8px; }
        .s1-btn:hover { background:#047857; }
        .s1-btn:disabled { background:#6EE7B7; cursor:not-allowed; }
        .s1-hint { font-size:12.5px; color:#94A3B8; }
      `}</style>

      <div className="s1-card">
        <div className="s1-grid">
          <div className="s1-field">
            <label>Supplier *</label>
            <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value, country_id: "", location_id: "" })}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="s1-field">
            <label>Country *</label>
            <select value={form.country_id} disabled={!form.supplier_id} onChange={e => setForm({ ...form, country_id: e.target.value, location_id: "" })}>
              <option value="">— Select country —</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.country_name}</option>)}
            </select>
          </div>
          <div className="s1-field" style={{ gridColumn: "1 / -1" }}>
            <label>Location / Warehouse *</label>
            <select value={form.location_id} disabled={!form.country_id} onChange={e => setForm({ ...form, location_id: e.target.value })}>
              <option value="">— Select location —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="s1-field">
            <label>Reporting Month *</label>
            <select value={String(form.month)} onChange={e => setForm({ ...form, month: Number(e.target.value) })}>
              {FULL_MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>
          <div className="s1-field">
            <label>Reporting Year *</label>
            <select value={String(form.year)} onChange={e => setForm({ ...form, year: Number(e.target.value) })}>
              {[2024, 2025, 2026].map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
          <div className="s1-field" style={{ gridColumn: "1 / -1" }}>
            <label>Submitted by *</label>
            <input value={form.submitter} onChange={e => setForm({ ...form, submitter: e.target.value })} placeholder="Your full name" />
          </div>
        </div>
        <hr className="s1-divider" />
        <div className="s1-footer">
          <button className="s1-btn" disabled={!canContinue} onClick={() => onComplete(form)}>
            Continue to Data Entry
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {!canContinue && <span className="s1-hint">All fields including your name are required.</span>}
        </div>
      </div>
    </div>
  );
}
