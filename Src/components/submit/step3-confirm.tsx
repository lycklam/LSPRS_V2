import { useState, useEffect } from "react";
import { supabase, calcPoints, SHORT_MONTHS } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface Props {
  selection: any;
  metricValues: Record<string, string>;
  onBack: () => void;
  onSuccess: (flagCount: number) => void;
}

const ZERO_TOL = [20, 22];
const BELOW_THRESH = [1, 2, 3, 4];

export default function Step3Confirm({ selection, metricValues, onBack, onSuccess }: Props) {
  const [approved, setApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [bands, setBands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [existingSubmission, setExistingSubmission] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("metrics").select("*, sub_categories(name)").eq("reported_by", "lsp").order("sort_order"),
      supabase.from("scoring_bands").select("*").order("band_order"),
    ]).then(([m, b]) => { setMetrics(m.data || []); setBands(b.data || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selection?.location_id) return;
    supabase.from("submissions").select("id,status,submitted_by,submitted_at")
      .eq("location_id", selection.location_id)
      .eq("reporting_month", Number(selection.month))
      .eq("reporting_year", Number(selection.year))
      .then(({ data }) => setExistingSubmission(data?.length ? data[0] : null));
  }, [selection?.location_id, selection?.month, selection?.year]);

  const getBands = (id: string) => bands.filter(b => b.metric_id === id).sort((a: any, b: any) => a.band_order - b.band_order);
  const getPoints = (id: string, val: string) => { if (!val) return null; return calcPoints(Number(val), getBands(id)); };

  const filledMetrics = metrics.filter(m => metricValues[m.id] !== undefined && metricValues[m.id] !== "");
  const flaggedMetrics = filledMetrics.filter(m => {
    const val = metricValues[m.id];
    if (ZERO_TOL.includes(m.number) && Number(val) >= 1) return true;
    if (BELOW_THRESH.includes(m.number) && Number(val) < 85) return true;
    return false;
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: existing } = await supabase.from("submissions").select("id,status")
        .eq("location_id", selection.location_id).eq("reporting_month", Number(selection.month)).eq("reporting_year", Number(selection.year));
      let subId: string;
      if (existing?.length) {
        subId = existing[0].id;
        const { data: lspResponses } = await supabase.from("responses").select("id,metric_id").eq("submission_id", subId);
        const lspIds = new Set(metrics.map(m => m.id));
        const toDelete = (lspResponses || []).filter(r => lspIds.has(r.metric_id)).map(r => r.id);
        if (toDelete.length) await supabase.from("responses").delete().in("id", toDelete);
        await supabase.from("threshold_flags").delete().eq("submission_id", subId);
        await supabase.from("submissions").update({ submitted_by: selection.submitter, submitted_at: new Date().toISOString(), status: flaggedMetrics.length > 0 ? "flagged" : "submitted" }).eq("id", subId);
      } else {
        const { data: newSub, error } = await supabase.from("submissions").insert({ location_id: selection.location_id, supplier_id: selection.supplier_id, country_id: selection.country_id, reporting_month: Number(selection.month), reporting_year: Number(selection.year), submitted_by: selection.submitter, submitted_at: new Date().toISOString(), status: flaggedMetrics.length > 0 ? "flagged" : "submitted" }).select("id");
        if (error) throw error;
        subId = newSub![0].id;
      }
      if (filledMetrics.length) {
        const { error } = await supabase.from("responses").insert(filledMetrics.map(m => ({ submission_id: subId, metric_id: m.id, value_numeric: Number(metricValues[m.id]), points_earned: getPoints(m.id, metricValues[m.id]), entered_by: selection.submitter, is_flagged: flaggedMetrics.some(f => f.id === m.id) })));
        if (error) throw error;
      }
      if (flaggedMetrics.length) {
        await supabase.from("threshold_flags").insert(flaggedMetrics.map(m => ({ submission_id: subId, metric_id: m.id, value_entered: Number(metricValues[m.id]), flag_type: ZERO_TOL.includes(m.number) ? "zero_tolerance" : "below_target" })));
      }
      toast({ title: "Submission recorded", description: flaggedMetrics.length > 0 ? `${flaggedMetrics.length} metric(s) flagged for review.` : "All data saved successfully." });
      onSuccess(flaggedMetrics.length);
    } catch (e: any) { toast({ title: "Submission failed", description: e.message, variant: "destructive" }); }
    setSubmitting(false);
  };

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
      <style>{`
        .s3-topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
        .s3-title{font-size:18px;font-weight:700;color:#0F1B2D;letter-spacing:-0.02em}
        .s3-sub{font-size:13px;color:#64748B;margin-top:3px}
        .s3-back{height:36px;padding:0 16px;background:#fff;color:#475569;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .s3-back:hover{border-color:#94A3B8}
        .s3-warn{background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:14px 18px}
        .s3-warn-title{font-size:13.5px;font-weight:700;color:#B45309;margin-bottom:4px}
        .s3-warn-body{font-size:13px;color:#92400E;line-height:1.5}
        .s3-summary{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .s3-summary h3{font-size:14px;font-weight:700;color:#0F1B2D;margin:0 0 14px}
        .s3-stats{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .s3-stat-label{font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.04em}
        .s3-stat-val{font-size:14px;font-weight:600;color:#0F1B2D;margin-top:3px}
        .s3-flag-box{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 18px}
        .s3-flag-title{font-size:13.5px;font-weight:700;color:#B91C1C;margin-bottom:8px}
        .s3-table-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .s3-table-hdr{padding:13px 20px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#0F1B2D;background:#FAFBFC}
        .s3t{width:100%;border-collapse:collapse}
        .s3t thead th{background:#F8FAFC;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:10px 20px;border-bottom:1px solid #E2E8F0;text-align:left}
        .s3t thead th:last-child,.s3t thead th:nth-child(2){text-align:right}
        .s3t tbody tr{border-bottom:1px solid #F8FAFC}
        .s3t tbody tr:last-child{border-bottom:none}
        .s3t tbody tr.flagged{background:#FFF8F8}
        .s3t td{padding:11px 20px;font-size:13.5px;color:#334155}
        .s3t td.val,.s3t td.pts{text-align:right;font-weight:600}
        .s3-confirm{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px}
        .s3-confirm h3{font-size:14px;font-weight:700;color:#15803D;margin:0 0 12px}
        .s3-check-row{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
        .s3-check{width:18px;height:18px;accent-color:#059669;flex-shrink:0;margin-top:2px}
        .s3-check-text{font-size:13.5px;color:#374151;line-height:1.5}
        .s3-btn-row{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
        .s3-submit{height:42px;padding:0 24px;background:#059669;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .s3-submit:hover{background:#047857}
        .s3-submit:disabled{background:#6EE7B7;cursor:not-allowed}
        .s3-empty{padding:24px 20px;text-align:center;color:#94A3B8;font-size:13px}
      `}</style>

      <div className="s3-topbar">
        <div>
          <div className="s3-title">Review & Submit</div>
          <div className="s3-sub">Review your entries before final submission.</div>
        </div>
        <button className="s3-back" onClick={onBack}>← Back</button>
      </div>

      {existingSubmission && (
        <div className="s3-warn">
          <div className="s3-warn-title">⚠ Existing submission for this period</div>
          <div className="s3-warn-body">A submission for <strong>{SHORT_MONTHS[selection?.month]} {selection?.year}</strong> already exists{existingSubmission.submitted_by ? ` (by ${existingSubmission.submitted_by})` : ""}. Continuing will <strong>overwrite the existing LSP data</strong>. Internal ratings will be preserved.</div>
        </div>
      )}

      <div className="s3-summary">
        <h3>Submission Summary</h3>
        <div className="s3-stats">
          <div><div className="s3-stat-label">Period</div><div className="s3-stat-val">{SHORT_MONTHS[selection?.month]} {selection?.year}</div></div>
          <div><div className="s3-stat-label">Submitted by</div><div className="s3-stat-val">{selection?.submitter}</div></div>
          <div><div className="s3-stat-label">Metrics entered</div><div className="s3-stat-val">{filledMetrics.length} values</div></div>
          <div><div className="s3-stat-label">Flags</div><div className="s3-stat-val" style={{ color: flaggedMetrics.length > 0 ? "#DC2626" : "#059669" }}>{flaggedMetrics.length > 0 ? `⚠ ${flaggedMetrics.length} below threshold` : "✓ None"}</div></div>
        </div>
      </div>

      {flaggedMetrics.length > 0 && (
        <div className="s3-flag-box">
          <div className="s3-flag-title">⚠ Flagged metrics — internal team will be notified</div>
          {flaggedMetrics.map(m => <div key={m.id} style={{ fontSize: 13, color: "#DC2626", marginBottom: 3 }}>• {m.name} — {metricValues[m.id]}{m.input_type === "percent" ? "%" : ""}</div>)}
        </div>
      )}

      <div className="s3-table-card">
        <div className="s3-table-hdr">Entered Values ({filledMetrics.length})</div>
        {filledMetrics.length === 0 ? (
          <div className="s3-empty">No metric values entered yet.</div>
        ) : (
          <table className="s3t">
            <thead><tr><th>Metric</th><th>Value</th><th>Points</th></tr></thead>
            <tbody>
              {filledMetrics.map(m => {
                const val = metricValues[m.id], pts = getPoints(m.id, val);
                const flagged = flaggedMetrics.some(f => f.id === m.id);
                return (
                  <tr key={m.id} className={flagged ? "flagged" : ""}>
                    <td>{m.name}{flagged && <span style={{ marginLeft: 6, color: "#DC2626" }}>⚠</span>}</td>
                    <td className="val">{val}{m.input_type === "percent" ? "%" : ""}</td>
                    <td className="pts" style={{ color: pts === 0 ? "#DC2626" : "#059669" }}>{pts !== null ? `${pts} / ${m.max_points}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="s3-confirm">
        <h3>✓ Confirm & Submit</h3>
        <label className="s3-check-row">
          <input type="checkbox" className="s3-check" checked={approved} onChange={e => setApproved(e.target.checked)} />
          <span className="s3-check-text">I confirm the data entered above is accurate and represents actual performance for the stated period and location.{existingSubmission ? " I understand this will overwrite the existing LSP submission." : ""}</span>
        </label>
        <div className="s3-btn-row">
          <button className="s3-submit" onClick={handleSubmit} disabled={!approved || submitting || filledMetrics.length === 0}>
            {submitting ? "Submitting…" : existingSubmission ? "✓ Overwrite & Submit" : "✓ Submit Performance Data"}
          </button>
          <button className="s3-back" onClick={onBack}>← Back</button>
        </div>
      </div>
    </div>
  );
}
