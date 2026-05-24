// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase, SHORT_MONTHS, deleteSubmissionCascade } from "@/lib/supabase";
import { runScoringEngine, ScoringResult, CategoryScore } from "@/lib/scoring-engine";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#F1F5F9", color: "#475569", label: "Draft" },
  submitted: { bg: "#FEF3C7", color: "#B45309", label: "Submitted" },
  flagged:   { bg: "#FEE2E2", color: "#B91C1C", label: "Flagged" },
  approved:  { bg: "#DCFCE7", color: "#15803D", label: "Approved" },
};

const CAT_COLORS = ["#2563EB","#F59E0B","#10B981","#8B5CF6","#EF4444","#06B6D4"];

export default function ReviewPanel() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [scoreResult, setScoreResult] = useState<ScoringResult | null>(null);
  const [existingScore, setExistingScore] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [scoring, setScoring] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("submissions")
        .select("*,suppliers(name,business_type),locations(name),countries(country_name)")
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("metrics").select("*").order("number"),
    ]).then(([s, m]) => { setSubmissions(s.data || []); setMetrics(m.data || []); setLoading(false); });
  }, []);

  const loadResponses = async (sub: any) => {
    setSelected(sub);
    setScoreResult(null);
    const [{ data: resp }, { data: overall }, { data: catScores }] = await Promise.all([
      supabase.from("responses").select("*").eq("submission_id", sub.id),
      supabase.from("overall_scores").select("*").eq("submission_id", sub.id).maybeSingle(),
      supabase.from("category_scores")
        .select("*, categories(number,name,weight_pct)")
        .eq("submission_id", sub.id)
        .order("categories(number)"),
    ]);
    setResponses(resp || []);
    const scoreData = overall ? { overall: overall, categories: catScores || [] } : null;
    setExistingScore(scoreData);
    // Auto-recalculate if approved but no score stored yet
    if (sub.status === "approved" && !overall) {
      try {
        const result = await runScoringEngine(sub.id);
        setScoreResult(result);
        const { data: newCatScores } = await supabase
          .from("category_scores")
          .select("*, categories(number,name,weight_pct)")
          .eq("submission_id", sub.id)
          .order("categories(number)");
        const { data: newOverall } = await supabase
          .from("overall_scores").select("*").eq("submission_id", sub.id).maybeSingle();
        setExistingScore({ overall: newOverall, categories: newCatScores || [] });
      } catch (e) {
        // Silent fail — score will show "approve to calculate"
      }
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setSaving(true);
    try {
      const update: any = { status };
      if (status === "approved") {
        update.approved_at = new Date().toISOString();

        // Run scoring engine on approval
        setScoring(true);
        try {
          const result = await runScoringEngine(id);
          setScoreResult(result);
          // Refresh existing score display
          const { data: catScores } = await supabase
            .from("category_scores")
            .select("*, categories(number,name,weight_pct)")
            .eq("submission_id", id)
            .order("categories(number)");
          const { data: overall } = await supabase
            .from("overall_scores").select("*").eq("submission_id", id).maybeSingle();
          setExistingScore({ overall: overall, categories: catScores || [] });
          toast({ title: `✓ Approved — Score: ${result.total_score}/100`, description: `${result.completeness_pct}% of metrics answered` });
        } catch (scoreErr: any) {
          toast({ title: "Approved — scoring failed", description: scoreErr.message, variant: "destructive" });
        }
        setScoring(false);
      }

      const { error } = await supabase.from("submissions").update(update).eq("id", id);
      if (error) throw error;
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
      if (selected?.id === id) setSelected((prev: any) => ({ ...prev, status }));
      if (status !== "approved") toast({ title: `Submission ${status}` });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };



  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteSubmissionCascade(deleteTarget.id);
      setSubmissions(prev => prev.filter(s => s.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) { setSelected(null); setResponses([]); setScoreResult(null); setExistingScore(null); }
      toast({ title: "Submission deleted" });
      setDeleteTarget(null);
    } catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const getMetric = (id: string) => metrics.find(m => m.id === id);
  const displayScore = scoreResult
    ? { total: scoreResult.total_score, categories: scoreResult.category_scores, completeness: scoreResult.completeness_pct }
    : existingScore
    ? { total: existingScore.overall?.total_score, categories: existingScore.categories, completeness: null }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .rp-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
        @media(max-width:900px){.rp-grid{grid-template-columns:1fr}}
        .rp-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06);display:flex;flex-direction:column}
        .rp-card-hdr{padding:14px 20px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#0F1B2D;display:flex;align-items:center;justify-content:space-between;background:#FAFBFC;flex-shrink:0}
        .rp-cnt{font-size:12px;font-weight:600;background:#EFF6FF;color:#2563EB;padding:2px 10px;border-radius:20px}
        .rp-list{overflow-y:auto;max-height:560px}
        .rp-row{padding:13px 20px;cursor:pointer;border-bottom:1px solid #F8FAFC;transition:background 0.1s;display:flex;align-items:center;justify-content:space-between;gap:12px}
        .rp-row:last-child{border-bottom:none}
        .rp-row:hover{background:#F8FAFC}
        .rp-row.active{background:#EFF6FF}
        .rp-supplier{font-size:13.5px;font-weight:600;color:#0F1B2D}
        .rp-meta{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .rp-row-score{font-size:12px;font-weight:700;color:#059669;background:#F0FDF4;border:1px solid #BBF7D0;padding:2px 8px;border-radius:12px;white-space:nowrap}
        .status-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0}
        .rp-empty{padding:48px 20px;text-align:center;color:#94A3B8;font-size:13.5px}
        .rp-detail{display:flex;flex-direction:column;height:100%;min-height:400px}
        .rp-detail-hdr{padding:16px 20px;border-bottom:1px solid #F1F5F9;flex-shrink:0}
        .rp-detail-supplier{font-size:15px;font-weight:700;color:#0F1B2D}
        .rp-detail-meta{font-size:12px;color:#64748B;margin-top:3px}
        .rp-detail-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
        .rp-stat-label{font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
        .rp-stat-val{font-size:13px;font-weight:600;color:#0F1B2D;margin-top:2px}

        /* Score panel */
        .rp-score-panel{padding:14px 20px;border-bottom:1px solid #F1F5F9;background:#F8FAFC}
        .rp-score-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .rp-score-title{font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em}
        .rp-score-total{font-size:28px;font-weight:800;color:#0F1B2D;letter-spacing:-0.03em;line-height:1}
        .rp-score-denom{font-size:14px;font-weight:400;color:#94A3B8}
        .rp-score-completeness{font-size:11.5px;color:#64748B;margin-top:2px}
        .rp-score-bar-wrap{height:6px;background:#E2E8F0;border-radius:20px;overflow:hidden;margin-bottom:12px}
        .rp-score-bar{height:100%;border-radius:20px;transition:width 0.6s ease}
        .rp-cat-scores{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .rp-cat-score-item{background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px}
        .rp-cat-score-name{font-size:10.5px;font-weight:600;color:#64748B;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rp-cat-score-pts{font-size:13px;font-weight:700;color:#0F1B2D}
        .rp-cat-score-pct{font-size:10.5px;color:#94A3B8;margin-left:4px}
        .rp-cat-score-bar{height:3px;border-radius:10px;margin-top:5px}
        .rp-rescore-btn{height:28px;padding:0 12px;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:5px}
        .rp-rescore-btn:disabled{opacity:0.5;cursor:not-allowed}
        .rp-scoring-spinner{width:12px;height:12px;border:2px solid #BFDBFE;border-top-color:#2563EB;border-radius:50%;animation:spin 0.7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}

        .rp-responses{flex:1;overflow-y:auto;max-height:200px}
        .rp-table{width:100%;border-collapse:collapse}
        .rp-table thead th{background:#F8FAFC;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:8px 16px;border-bottom:1px solid #E2E8F0;text-align:left}
        .rp-table thead th:last-child,.rp-table thead th:nth-child(2){text-align:right}
        .rp-table tbody tr{border-bottom:1px solid #F8FAFC}
        .rp-table tbody tr:last-child{border-bottom:none}
        .rp-table tbody tr.flagged{background:#FEF2F2}
        .rp-table td{padding:9px 16px;font-size:12.5px;color:#334155}
        .rp-table td.val,.rp-table td.pts{text-align:right;font-weight:600}
        .pts-good{color:#059669}
        .pts-bad{color:#DC2626}
        .rp-actions{padding:14px 20px;border-top:1px solid #F1F5F9;background:#FAFBFC;flex-shrink:0}
        .rp-btn-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .rp-btn{height:34px;padding:0 14px;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all 0.15s}
        .rp-btn-approve{background:#DCFCE7;color:#15803D;border:1.5px solid #BBF7D0}
        .rp-btn-approve:hover{background:#059669;color:#fff;border-color:#059669}
        .rp-btn-flag{background:#FEE2E2;color:#B91C1C;border:1.5px solid #FECACA}
        .rp-btn-flag:hover{background:#DC2626;color:#fff;border-color:#DC2626}
        .rp-btn-reset{background:#F8FAFC;color:#475569;border:1.5px solid #E2E8F0}
        .rp-btn-reset:hover{background:#E2E8F0;color:#0F1B2D}
        .rp-btn-delete{background:#fff;color:#DC2626;border:1.5px solid #FECACA;margin-left:auto}
        .rp-btn-delete:hover{background:#FEE2E2}
        .rp-approved-note{font-size:12px;color:#059669;font-weight:500;margin-top:8px}
        .rp-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;color:#94A3B8;gap:12px}
        .rp-modal-ov{position:fixed;inset:0;background:rgba(15,27,45,0.4);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}
        .rp-modal{background:#fff;border-radius:14px;padding:28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(15,27,45,0.2)}
        .rp-modal h4{font-size:16px;font-weight:700;color:#0F1B2D;margin:0 0 10px}
        .rp-modal p{font-size:13.5px;color:#64748B;line-height:1.6;margin:0 0 20px}
        .rp-modal-acts{display:flex;gap:10px;justify-content:flex-end}
        .rp-modal-cancel{height:38px;padding:0 18px;background:#fff;color:#475569;border:1.5px solid #CBD5E1;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .rp-modal-del{height:38px;padding:0 18px;background:#FEF2F2;color:#DC2626;border:1.5px solid #FECACA;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .rp-modal-del:hover{background:#DC2626;color:#fff}
      `}</style>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>Loading submissions…</div>
      ) : (
        <div className="rp-grid">
          {/* Left: submission list */}
          <div className="rp-card">
            <div className="rp-card-hdr">
              <span>Submissions</span>
              <span className="rp-cnt">{submissions.length}</span>
            </div>
            {submissions.length === 0 ? (
              <div className="rp-empty">No submissions yet.</div>
            ) : (
              <div className="rp-list">
                {submissions.map(s => {
                  const st = STATUS_CONFIG[s.status] || STATUS_CONFIG.draft;
                  return (
                    <div key={s.id} className={`rp-row ${selected?.id === s.id ? "active" : ""}`} onClick={() => loadResponses(s)}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="rp-supplier">{s.suppliers?.name || "—"}</div>
                        <div className="rp-meta">{s.locations?.name} · {s.countries?.country_name} · {SHORT_MONTHS[s.reporting_month]} {s.reporting_year}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          <div className="rp-card">
            {!selected ? (
              <div className="rp-placeholder">
                <div style={{ width: 48, height: 48, background: "#F1F5F9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6h14M3 10h10M3 14h6" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>
                <p style={{ fontSize: 13.5 }}>Select a submission to review</p>
              </div>
            ) : (
              <div className="rp-detail">
                {/* Header */}
                <div className="rp-detail-hdr">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div className="rp-detail-supplier">{selected.suppliers?.name}</div>
                      <div className="rp-detail-meta">{selected.locations?.name} · {selected.countries?.country_name} · {SHORT_MONTHS[selected.reporting_month]} {selected.reporting_year}</div>
                    </div>
                    {(() => { const st = STATUS_CONFIG[selected.status] || STATUS_CONFIG.draft; return <span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>; })()}
                  </div>
                  <div className="rp-detail-stats">
                    <div><div className="rp-stat-label">Submitted by</div><div className="rp-stat-val">{selected.submitted_by || "—"}</div></div>
                    <div><div className="rp-stat-label">Reviewed by</div><div className="rp-stat-val">{selected.reviewed_by || "—"}</div></div>
                    <div><div className="rp-stat-label">Date</div><div className="rp-stat-val">{selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString() : "—"}</div></div>
                    <div><div className="rp-stat-label">Responses</div><div className="rp-stat-val">{responses.length} recorded</div></div>
                  </div>
                </div>

                {/* Score panel */}
                {displayScore ? (
                  <div className="rp-score-panel">
                    <div className="rp-score-top">
                      <div>
                        <div className="rp-score-title">Overall Score</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                          <span className="rp-score-total" style={{ color: displayScore.total >= 80 ? "#059669" : displayScore.total >= 60 ? "#D97706" : "#DC2626" }}>
                            {displayScore.total}
                          </span>
                          <span className="rp-score-denom">/100</span>
                        </div>
                        {displayScore.completeness !== null && (
                          <div className="rp-score-completeness">{displayScore.completeness}% of metrics answered</div>
                        )}
                      </div>

                    </div>
                    <div className="rp-score-bar-wrap">
                      <div className="rp-score-bar" style={{
                        width: `${Math.min(displayScore.total, 100)}%`,
                        background: displayScore.total >= 80 ? "#059669" : displayScore.total >= 60 ? "#D97706" : "#DC2626"
                      }} />
                    </div>
                    <div className="rp-cat-scores">
                      {(displayScore.categories as any[]).map((cs: any, ci: number) => {
                        const name = cs.category_name || cs.categories?.name || `Cat ${ci + 1}`;
                        const pts = cs.normalized_score ?? cs.points_earned ?? 0;
                        const max = cs.category_weight ?? cs.categories?.weight_pct ?? 0;
                        const pct = max > 0 ? Math.round((pts / max) * 100) : 0;
                        return (
                          <div key={cs.category_id} className="rp-cat-score-item">
                            <div className="rp-cat-score-name" title={name}>{name}</div>
                            <div>
                              <span className="rp-cat-score-pts">{pts}</span>
                              <span className="rp-cat-score-pct">/ {max} pts ({pct}%)</span>
                            </div>
                            <div className="rp-cat-score-bar" style={{ background: "#E2E8F0" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: CAT_COLORS[ci % CAT_COLORS.length], borderRadius: 10 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 13, color: "#94A3B8" }}>No score yet — approve to calculate</div>

                  </div>
                )}

                {/* Responses table */}
                <div className="rp-responses">
                  {responses.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>No responses recorded.</div>
                  ) : (
                    <table className="rp-table">
                      <thead><tr><th>Metric</th><th>Value</th><th>Pts</th></tr></thead>
                      <tbody>
                        {responses.map(r => {
                          const m = getMetric(r.metric_id);
                          const val = r.value_likert ?? r.value_numeric;
                          return (
                            <tr key={r.id} className={r.is_flagged ? "flagged" : ""}>
                              <td>{m?.name || "—"}{r.is_flagged && <span style={{ marginLeft: 6, color: "#DC2626" }}>⚠</span>}</td>
                              <td className="val">{val ?? "—"}{m?.input_type === "percent" ? "%" : ""}{m?.input_type === "likert" ? "/5" : ""}</td>
                              <td className={`pts ${r.points_earned === 0 ? "pts-bad" : "pts-good"}`}>{r.points_earned ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Actions */}
                <div className="rp-actions">
                  <div className="rp-btn-row">
                    {selected.status !== "approved" && (
                      <button className="rp-btn rp-btn-approve" onClick={() => updateStatus(selected.id, "approved")} disabled={saving}>
                        {saving ? "Approving & scoring…" : "✓ Approve"}
                      </button>
                    )}
                    {selected.status !== "flagged" && <button className="rp-btn rp-btn-flag" onClick={() => updateStatus(selected.id, "flagged")} disabled={saving}>⚠ Flag</button>}
                    {selected.status !== "submitted" && <button className="rp-btn rp-btn-reset" onClick={() => updateStatus(selected.id, "submitted")} disabled={saving}>↩ Reset</button>}
                    <button className="rp-btn rp-btn-delete" onClick={() => setDeleteTarget(selected)}>Delete</button>
                  </div>
                  {selected.status === "approved" && <div className="rp-approved-note">✓ Approved — scores calculated automatically</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="rp-modal-ov" onClick={() => setDeleteTarget(null)}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>
            <h4>Delete this submission?</h4>
            <p>This will permanently delete the submission for <strong>{deleteTarget?.suppliers?.name}</strong> — {deleteTarget && `${SHORT_MONTHS[deleteTarget.reporting_month]} ${deleteTarget.reporting_year}`}. All responses, scores and flags will be deleted.</p>
            <div className="rp-modal-acts">
              <button className="rp-modal-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="rp-modal-del" onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
