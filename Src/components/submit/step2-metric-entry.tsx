import { useState, useEffect } from "react";
import { supabase, CAT_COLORS, calcPoints } from "@/lib/supabase";

interface Props {
  selection: any;
  metricValues: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onBack: () => void;
  onContinue: () => void;
}

const ZERO_TOL = [20, 22];
const BELOW_THRESH = [1, 2, 3, 4];

export default function Step2MetricEntry({ selection, metricValues, onChange, onBack, onContinue }: Props) {
  const [categories, setCategories] = useState<any[]>([]);
  const [allMetrics, setAllMetrics] = useState<any[]>([]);
  const [relevance, setRelevance] = useState<Record<string, boolean>>({});
  const [bands, setBands] = useState<any[]>([]);
  const [prevValues, setPrevValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("*").order("number"),
      supabase.from("metrics").select("*, sub_categories(name)").eq("reported_by", "lsp").order("sort_order"),
      supabase.from("scoring_bands").select("*").order("band_order"),
    ]).then(([c, m, b]) => { setCategories(c.data || []); setAllMetrics(m.data || []); setBands(b.data || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selection?.supplier_id || !allMetrics.length) return;
    const rel: Record<string, boolean> = {};
    allMetrics.forEach(m => { rel[m.id] = true; });
    supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id", selection.supplier_id).is("location_id", null)
      .then(({ data: sd }) => {
        (sd || []).forEach(r => { rel[r.metric_id] = r.is_relevant; });
        if (!selection?.location_id) { setRelevance(rel); return; }
        supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id", selection.supplier_id).eq("location_id", selection.location_id)
          .then(({ data: ld }) => { (ld || []).forEach(r => { rel[r.metric_id] = r.is_relevant; }); setRelevance(rel); });
      });
  }, [selection?.supplier_id, selection?.location_id, allMetrics]);

  useEffect(() => {
    if (!selection?.location_id) return;
    const pm = selection.month === 1 ? 12 : selection.month - 1, py = selection.month === 1 ? selection.year - 1 : selection.year;
    supabase.from("submissions").select("id").eq("location_id", selection.location_id).eq("reporting_month", pm).eq("reporting_year", py)
      .then(({ data }) => {
        if (!data?.length) return;
        supabase.from("responses").select("metric_id,value_numeric").eq("submission_id", data[0].id)
          .then(({ data: rs }) => { const pv: Record<string, number> = {}; (rs || []).forEach(r => { if (r.value_numeric !== null) pv[r.metric_id] = r.value_numeric; }); setPrevValues(pv); });
      });
  }, [selection?.location_id, selection?.month, selection?.year]);

  const metrics = allMetrics.filter(m => {
    if (relevance[m.id] === false) return false;
    if (selection?.business_type === "B2B" && !m.applies_b2b) return false;
    if (selection?.business_type === "B2C" && !m.applies_b2c) return false;
    return true;
  });

  const getBands = (id: string) => bands.filter(b => b.metric_id === id).sort((a: any, b: any) => a.band_order - b.band_order);
  const getMatchBand = (id: string, val: string) => { if (!val) return null; const n = Number(val); return getBands(id).find(b => n >= b.threshold_min && n <= b.threshold_max) || null; };
  const isZeroTol = (m: any) => ZERO_TOL.includes(m.number);
  const isFlagged = (m: any, val: string) => val && ((isZeroTol(m) && Number(val) >= 1) || (BELOW_THRESH.includes(m.number) && Number(val) < 85));

  const flags = metrics.filter(m => {
    const val = metricValues[m.id]; if (!val) return false;
    return isFlagged(m, val);
  });

  const metricsByCat = categories.map(cat => ({ ...cat, metrics: metrics.filter(m => m.category_id === cat.id) })).filter(c => c.metrics.length > 0);
  const filledCount = metrics.filter(m => metricValues[m.id] !== undefined && metricValues[m.id] !== "").length;

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>Loading metrics…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <style>{`
        .s2-topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
        .s2-title{font-size:18px;font-weight:700;color:#0F1B2D;letter-spacing:-0.02em}
        .s2-sub{font-size:13px;color:#64748B;margin-top:3px}
        .s2-back{height:36px;padding:0 16px;background:#fff;color:#475569;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .s2-back:hover{border-color:#94A3B8;color:#0F1B2D}
        .s2-flag-box{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 18px}
        .s2-flag-title{font-size:13.5px;font-weight:700;color:#B91C1C;margin-bottom:8px}
        .s2-flag-item{font-size:13px;color:#DC2626;display:flex;gap:8px;margin-bottom:4px}
        .s2-cat{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .s2-cat-hdr{padding:13px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:10px;background:#FAFBFC}
        .s2-metric{padding:18px 20px;border-bottom:1px solid #F8FAFC;display:flex;align-items:flex-start;gap:16px}
        .s2-metric:last-child{border-bottom:none}
        .s2-metric.flagged{background:#FFF8F8}
        .s2-metric-info{flex:1;min-width:0}
        .s2-metric-name{font-size:14px;font-weight:600;color:#1E293B}
        .s2-metric-sub{font-size:12px;color:#94A3B8;margin-top:2px}
        .s2-prev{font-size:11.5px;color:#94A3B8;margin-top:3px}
        .s2-ztol{font-size:11.5px;color:#D97706;font-weight:600;margin-top:4px}
        .s2-band-pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-top:6px}
        .s2-input-col{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
        .s2-input-row{display:flex;align-items:center;gap:6px}
        .s2-input{height:40px;width:100px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;font-weight:600;text-align:right;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;transition:border-color 0.15s,box-shadow 0.15s}
        .s2-input:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,0.12)}
        .s2-input.err{border-color:#FCA5A5;background:#FFF8F8}
        .s2-unit{font-size:13px;color:#94A3B8;font-weight:500}
        .s2-pts{font-size:12px;font-weight:700}
        .s2-bottombar{display:flex;align-items:center;justify-content:space-between;padding-top:8px}
        .s2-continue{height:42px;padding:0 24px;background:#059669;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:8px}
        .s2-continue:hover{background:#047857}
      `}</style>

      <div className="s2-topbar">
        <div>
          <div className="s2-title">Enter Performance Data</div>
          <div className="s2-sub">{filledCount} of {metrics.length} metrics filled · Scoring bands shown as you type</div>
        </div>
        <button className="s2-back" onClick={onBack}>← Back</button>
      </div>

      {flags.length > 0 && (
        <div className="s2-flag-box">
          <div className="s2-flag-title">⚠ {flags.length} metric{flags.length > 1 ? "s" : ""} below threshold</div>
          {flags.map(m => <div key={m.id} className="s2-flag-item"><span>•</span><span>{m.name} — {isZeroTol(m) ? "Zero tolerance" : `${metricValues[m.id]}% below 85% threshold`}</span></div>)}
          <div style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>These will be flagged for internal review after submission.</div>
        </div>
      )}

      {metricsByCat.map((cat, ci) => (
        <div key={cat.id} className="s2-cat">
          <div className="s2-cat-hdr">
            <span style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, background: CAT_COLORS[ci] + "22", color: CAT_COLORS[ci] }}>{cat.number}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0F1B2D" }}>{cat.name}</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8" }}>{cat.weight_pct}% · {cat.max_points} pts</span>
          </div>
          {cat.metrics.map((m: any) => {
            const val = metricValues[m.id] || "";
            const matchBand = getMatchBand(m.id, val);
            const pts = val ? calcPoints(Number(val), getBands(m.id)) : null;
            const prev = prevValues[m.id];
            const flagged = isFlagged(m, val);
            return (
              <div key={m.id} className={`s2-metric ${flagged ? "flagged" : ""}`}>
                <div className="s2-metric-info">
                  <div className="s2-metric-name">{m.name}</div>
                  <div className="s2-metric-sub">{m.sub_categories?.name ? `${m.sub_categories.name} · ` : ""}{m.input_type === "percent" ? "Enter %" : "Enter count"} · {m.max_points} pts max</div>
                  {prev !== undefined && <div className="s2-prev">Last month: {prev}{m.input_type === "percent" ? "%" : ""}</div>}
                  {isZeroTol(m) && <div className="s2-ztol">⚠ Zero tolerance — any incident = 0 pts</div>}
                  {matchBand && <div className="s2-band-pill" style={{ background: flagged ? "#FEE2E2" : "#DCFCE7", color: flagged ? "#B91C1C" : "#15803D" }}>{matchBand.label} → {matchBand.points} pts</div>}
                </div>
                <div className="s2-input-col">
                  <div className="s2-input-row">
                    <input type="number" min="0" max={m.input_type === "percent" ? 100 : undefined}
                      value={val} onChange={e => onChange({ ...metricValues, [m.id]: e.target.value })}
                      placeholder={m.input_type === "percent" ? "0–100" : "Count"}
                      className={`s2-input ${flagged ? "err" : ""}`} />
                    {m.input_type === "percent" && <span className="s2-unit">%</span>}
                  </div>
                  {pts !== null && <div className="s2-pts" style={{ color: flagged ? "#DC2626" : "#059669" }}>{pts} / {m.max_points} pts</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="s2-bottombar">
        <button className="s2-back" onClick={onBack}>← Back</button>
        <button className="s2-continue" onClick={onContinue}>
          Review & Submit
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}
