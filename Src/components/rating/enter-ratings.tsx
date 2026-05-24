import { useState, useEffect } from "react";
import { supabase, FULL_MONTHS, CAT_COLORS } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const SEL = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;transition:border-color 0.15s,box-shadow 0.15s;font-family:'DM Sans',sans-serif;width:100%;appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center`;
const INP = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;transition:border-color 0.15s,box-shadow 0.15s;font-family:'DM Sans',sans-serif;width:100%`;

export default function EnterRatings() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [anchors, setAnchors] = useState<any[]>([]);
  const [prevValues, setPrevValues] = useState<Record<string, number>>({});
  const [values, setValues] = useState<Record<string, number>>({});
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const now = new Date();
  const [form, setForm] = useState({
    supplier_id: "", country_id: "", location_id: "",
    month: now.getMonth() + 1, year: now.getFullYear(), reviewer: ""
  });

  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name,business_type").eq("status", "active").order("name"),
      supabase.from("categories").select("*").order("number"),
      supabase.from("metrics").select("*, sub_categories(name)").eq("reported_by", "internal").order("sort_order"),
      supabase.from("likert_anchors").select("*").order("score"),
    ]).then(([s, c, m, a]) => {
      setSuppliers(s.data || []);
      setCategories(c.data || []);
      setMetrics(m.data || []);
      setAnchors(a.data || []);
    });
  }, []);

  useEffect(() => {
    if (form.supplier_id) {
      supabase.from("countries").select("id,country_name").eq("supplier_id", form.supplier_id).order("country_name")
        .then(({ data }) => setCountries(data || []));
      setForm(f => ({ ...f, country_id: "", location_id: "" }));
    }
  }, [form.supplier_id]);

  useEffect(() => {
    if (form.country_id) {
      supabase.from("locations").select("id,name").eq("country_id", form.country_id).eq("status", "active").order("name")
        .then(({ data }) => setLocations(data || []));
      setForm(f => ({ ...f, location_id: "" }));
    }
  }, [form.country_id]);

  useEffect(() => {
    if (!form.location_id) return;
    setPrevValues({});
    setValues({});
    const pm = form.month === 1 ? 12 : form.month - 1;
    const py = form.month === 1 ? form.year - 1 : form.year;
    supabase.from("submissions").select("id")
      .eq("location_id", form.location_id).eq("reporting_month", pm).eq("reporting_year", py)
      .then(({ data }) => {
        if (!data?.length) return;
        supabase.from("responses").select("metric_id,value_likert").eq("submission_id", data[0].id)
          .then(({ data: rs }) => {
            const pv: Record<string, number> = {};
            (rs || []).forEach(r => { if (r.value_likert) pv[r.metric_id] = r.value_likert; });
            setPrevValues(pv);
            setValues(pv);
          });
      });
  }, [form.location_id, form.month, form.year]);

  // ── FIX: deduplicate anchors by score per metric to prevent double buttons ──
  const getAnchors = (metricId: string) => {
    const seen = new Set<number>();
    return anchors
      .filter(a => a.metric_id === metricId)
      .sort((a, b) => a.score - b.score)
      .filter(a => { if (seen.has(a.score)) return false; seen.add(a.score); return true; });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      let subId: string;
      const { data: existing } = await supabase.from("submissions").select("id")
        .eq("location_id", form.location_id).eq("reporting_month", form.month).eq("reporting_year", form.year);
      if (existing?.length) {
        subId = existing[0].id;
        await supabase.from("submissions").update({ reviewed_by: form.reviewer, reviewed_at: new Date().toISOString() }).eq("id", subId);
      } else {
        const { data: newSub, error } = await supabase.from("submissions").insert({
          location_id: form.location_id, supplier_id: form.supplier_id, country_id: form.country_id,
          reporting_month: form.month, reporting_year: form.year,
          reviewed_by: form.reviewer, reviewed_at: new Date().toISOString(), status: "draft"
        }).select("id");
        if (error) throw error;
        subId = newSub![0].id;
      }
      const toSave = metrics.filter(m => values[m.id] !== undefined);
      for (const m of toSave) {
        const { data: ex } = await supabase.from("responses").select("id").eq("submission_id", subId).eq("metric_id", m.id);
        if (ex?.length) {
          await supabase.from("responses").update({ value_likert: values[m.id], prev_month_value: prevValues[m.id] || null, entered_by: form.reviewer }).eq("id", ex[0].id);
        } else {
          await supabase.from("responses").insert({ submission_id: subId, metric_id: m.id, value_likert: values[m.id], prev_month_value: prevValues[m.id] || null, entered_by: form.reviewer });
        }
      }
      setSaved(true);
      toast({ title: "Ratings saved successfully" });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  if (saved) return (
    <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
      <div style={{ width: 64, height: 64, background: "#DCFCE7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14l6 6 12-12" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F1B2D", margin: "0 0 8px" }}>Ratings saved!</h2>
      <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 24px" }}>Internal ratings recorded for this submission.</p>
      <button style={{ height: 40, padding: "0 20px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
        onClick={() => { setSaved(false); setValues({}); setPrevValues({}); setApproved(false); setForm({ supplier_id: "", country_id: "", location_id: "", month: now.getMonth() + 1, year: now.getFullYear(), reviewer: "" }); }}>
        Enter Another
      </button>
    </div>
  );

  const metricsByCat = categories
    .map(cat => ({ ...cat, metrics: metrics.filter(m => m.category_id === cat.id) }))
    .filter(c => c.metrics.length > 0);

  const LBL = { fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: "0.02em", textTransform: "uppercase" as const, marginBottom: 5 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <style>{`
        .er-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .er-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media(max-width:640px){.er-grid{grid-template-columns:1fr}}
        .er-cat{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .er-cat-hdr{padding:13px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:10px;background:#FAFBFC}

        /* ── Metric row ───────────────────────────── */
        .er-metric{padding:18px 20px;border-bottom:1px solid #F1F5F9}
        .er-metric:last-child{border-bottom:none}
        .er-metric.carried{background:rgba(239,246,255,0.5)}
        .er-metric-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
        .er-metric-name{font-size:14px;font-weight:700;color:#0F1B2D;line-height:1.3}
        /* ── FIX: show description as the question ── */
        .er-metric-question{font-size:13px;color:#475569;margin-top:4px;line-height:1.5;font-style:italic}
        .er-metric-sub{font-size:11.5px;color:#94A3B8;margin-top:3px}
        .er-carried-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#2563EB;background:#DBEAFE;padding:2px 8px;border-radius:4px;margin-top:5px}
        .er-score{text-align:right;flex-shrink:0;min-width:52px}
        .er-score-num{font-size:26px;font-weight:800;color:#0F1B2D;line-height:1}
        .er-score-denom{font-size:12px;font-weight:400;color:#94A3B8}
        .er-score-label{font-size:11px;font-weight:700;color:#2563EB;margin-top:2px}

        /* ── FIX: Compact 5-column Likert grid ────── */
        .er-likert{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
        .er-lbtn{
          display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
          padding:8px 4px 6px;border-radius:8px;border:1.5px solid #E2E8F0;
          background:#fff;cursor:pointer;transition:all 0.15s;font-family:'DM Sans',sans-serif;
          text-align:center;
        }
        .er-lbtn:hover{border-color:#93C5FD;background:#F0F7FF}
        .er-lbtn.sel{border-color:#2563EB;background:#2563EB;color:#fff}
        .er-lbtn.carried-val{border-color:#93C5FD;background:#EFF6FF}
        /* FIX: Score number — smaller and tighter */
        .er-lbtn-score{font-size:15px;font-weight:800;line-height:1;margin-bottom:4px}
        /* FIX: Label row */
        .er-lbtn-label{font-size:10px;font-weight:700;line-height:1.2;color:#475569}
        .er-lbtn.sel .er-lbtn-label{color:rgba(255,255,255,0.9)}
        .er-lbtn.carried-val .er-lbtn-label{color:#1D4ED8}
        /* FIX: Description row — always visible */
        .er-lbtn-desc{font-size:10px;line-height:1.3;color:#94A3B8;margin-top:3px}
        .er-lbtn.sel .er-lbtn-desc{color:rgba(255,255,255,0.7)}

        .er-confirm{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px}
        .er-confirm h3{font-size:14px;font-weight:700;color:#15803D;margin:0 0 12px}
        .er-check-row{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
        .er-check{width:18px;height:18px;accent-color:#059669;flex-shrink:0;margin-top:2px}
        .er-check-text{font-size:13.5px;color:#374151;line-height:1.5}
        .er-save-btn{height:40px;padding:0 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;margin-top:14px}
        .er-save-btn:hover{background:#047857}
        .er-save-btn:disabled{background:#6EE7B7;cursor:not-allowed}
        .er-prev-note{font-size:11.5px;color:#94A3B8;margin-top:3px}
      `}</style>

      {/* Supplier & Period */}
      <div className="er-card">
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F1B2D", marginBottom: 20 }}>Supplier & Period</div>
        <div className="er-grid">
          <div><div style={LBL}>Supplier</div>
            <select style={{ cssText: SEL } as any} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value, country_id: "", location_id: "" })}>
              <option value="">— Select —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Country</div>
            <select style={{ cssText: SEL } as any} value={form.country_id} disabled={!form.supplier_id} onChange={e => setForm({ ...form, country_id: e.target.value, location_id: "" })}>
              <option value="">— Select —</option>{countries.map(c => <option key={c.id} value={c.id}>{c.country_name}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Location</div>
            <select style={{ cssText: SEL } as any} value={form.location_id} disabled={!form.country_id} onChange={e => setForm({ ...form, location_id: e.target.value })}>
              <option value="">— Select —</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Month</div>
            <select style={{ cssText: SEL } as any} value={String(form.month)} onChange={e => setForm({ ...form, month: Number(e.target.value) })}>
              {FULL_MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Year</div>
            <select style={{ cssText: SEL } as any} value={String(form.year)} onChange={e => setForm({ ...form, year: Number(e.target.value) })}>
              {[2024, 2025, 2026].map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Reviewed by</div>
            <input style={{ cssText: INP } as any} value={form.reviewer} onChange={e => setForm({ ...form, reviewer: e.target.value })} placeholder="Your name" />
          </div>
        </div>
      </div>

      {form.location_id && <>
        {Object.keys(prevValues).length > 0 && (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "11px 16px", fontSize: 13, color: "#1D4ED8" }}>
            ℹ Previous month ratings pre-filled. Review and adjust where needed before saving.
          </div>
        )}

        {metricsByCat.map((cat, ci) => (
          <div key={cat.id} className="er-cat">
            <div className="er-cat-hdr">
              <span style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, background: CAT_COLORS[ci] + "22", color: CAT_COLORS[ci] }}>{cat.number}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0F1B2D" }}>{cat.name}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8" }}>{cat.weight_pct}% · {cat.max_points} pts</span>
            </div>

            {cat.metrics.map((m: any) => {
              const val = values[m.id];
              const prev = prevValues[m.id];
              const isCarried = prev !== undefined && val === prev;
              // ── FIX: deduplicated anchors ──────────────────────────────
              const mAnchors = getAnchors(m.id);
              const selAnchor = mAnchors.find(a => a.score === val);

              return (
                <div key={m.id} className={`er-metric ${isCarried ? "carried" : ""}`}>
                  <div className="er-metric-top">
                    <div style={{ flex: 1 }}>
                      <div className="er-metric-name">{m.name}</div>
                      {/* ── FIX: Show description as rating question ──── */}
                      {m.description && (
                        <div className="er-metric-question">{m.description}</div>
                      )}
                      <div className="er-metric-sub">
                        {m.sub_categories?.name ? `${m.sub_categories.name} · ` : ""}{m.max_points} pts max
                      </div>
                      {isCarried && <div className="er-carried-tag">↩ carried from last month</div>}
                      {prev !== undefined && !isCarried && (
                        <div className="er-prev-note">Last month: {prev}/5</div>
                      )}
                    </div>
                    <div className="er-score">
                      <div>
                        <span className="er-score-num" style={{ color: val ? "#0F1B2D" : "#CBD5E1" }}>{val ?? "—"}</span>
                        <span className="er-score-denom">/5</span>
                      </div>
                      {selAnchor && <div className="er-score-label">{selAnchor.label}</div>}
                    </div>
                  </div>

                  {/* ── FIX: Compact Likert buttons with score + label + description ── */}
                  <div className="er-likert">
                    {mAnchors.map(anchor => {
                      const isSel = val === anchor.score;
                      const isCarriedVal = isCarried && prev === anchor.score;
                      // Truncate description to keep boxes compact
                      const desc = anchor.description
                        ? (anchor.description.length > 50 ? anchor.description.substring(0, 48) + "…" : anchor.description)
                        : null;
                      return (
                        <button
                          key={anchor.score}
                          className={`er-lbtn ${isSel ? "sel" : ""} ${isCarriedVal && !isSel ? "carried-val" : ""}`}
                          onClick={() => setValues({ ...values, [m.id]: anchor.score })}
                        >
                          <div className="er-lbtn-score">{anchor.score}</div>
                          <div className="er-lbtn-label">{anchor.label}</div>
                          {desc && <div className="er-lbtn-desc">{desc}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div className="er-confirm">
          <h3>✓ Confirm & Save Ratings</h3>
          <label className="er-check-row">
            <input type="checkbox" className="er-check" checked={approved} onChange={e => setApproved(e.target.checked)} />
            <span className="er-check-text">I confirm all ratings have been reviewed and carry-forward values checked and modified where required.</span>
          </label>
          <button className="er-save-btn" onClick={handleSubmit} disabled={!approved || saving || !form.reviewer || !form.location_id}>
            {saving ? "Saving…" : "✓ Save Ratings"}
          </button>
        </div>
      </>}
    </div>
  );
}
