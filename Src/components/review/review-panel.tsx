// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase, SHORT_MONTHS, deleteSubmissionCascade } from "@/lib/supabase";
import { runScoringEngine, ScoringResult } from "@/lib/scoring-engine";
import { useToast } from "@/hooks/use-toast";

const ST = {
  draft:     { bg: "#F1F5F9", color: "#475569", label: "Draft" },
  submitted: { bg: "#FEF3C7", color: "#B45309", label: "Submitted" },
  flagged:   { bg: "#FEE2E2", color: "#B91C1C", label: "Flagged" },
  approved:  { bg: "#DCFCE7", color: "#15803D", label: "Approved" },
};
const CAT_COLORS = ["#2563EB","#F59E0B","#10B981","#8B5CF6","#EF4444","#06B6D4"];
const sc = (s: number) => s >= 80 ? "#059669" : s >= 60 ? "#D97706" : "#DC2626";
const scBg = (s: number) => s >= 80 ? "#DCFCE7" : s >= 60 ? "#FEF3C7" : "#FEE2E2";

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

  // Expanded tree state: Set of "supplier_id/country_id/location_id" keys
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("submissions")
        .select("*,suppliers(name,business_type),locations(name),countries(country_name)")
        .order("suppliers(name)").order("countries(country_name)").order("locations(name)")
        .order("reporting_year").order("reporting_month")
        .limit(200),
      supabase.from("metrics").select("*").order("number"),
    ]).then(([s, m]) => {
      setSubmissions(s.data || []);
      setMetrics(m.data || []);
      setLoading(false);
      // Auto-expand all suppliers on load
      const supIds = new Set<string>((s.data || []).map((x: any) => x.supplier_id));
      setExpandedSuppliers(supIds);
    });
  }, []);

  // ── Build grouped tree ────────────────────────────────────────────────────
  const buildTree = () => {
    const tree: Record<string, {
      supplier_id: string; name: string;
      countries: Record<string, {
        country_id: string; name: string;
        locations: Record<string, {
          location_id: string; name: string;
          submissions: any[];
        }>;
      }>;
    }> = {};

    submissions.forEach(s => {
      const supId = s.supplier_id;
      const cId = s.country_id;
      const lId = s.location_id;
      if (!tree[supId]) tree[supId] = { supplier_id: supId, name: s.suppliers?.name || supId, countries: {} };
      if (!tree[supId].countries[cId]) tree[supId].countries[cId] = { country_id: cId, name: s.countries?.country_name || cId, locations: {} };
      if (!tree[supId].countries[cId].locations[lId]) tree[supId].countries[cId].locations[lId] = { location_id: lId, name: s.locations?.name || lId, submissions: [] };
      tree[supId].countries[cId].locations[lId].submissions.push(s);
    });
    return tree;
  };

  const loadResponses = async (sub: any) => {
    setSelected(sub);
    setScoreResult(null);
    const [{ data: resp }, { data: overall }, { data: catScores }] = await Promise.all([
      supabase.from("responses").select("*").eq("submission_id", sub.id),
      supabase.from("overall_scores").select("*").eq("submission_id", sub.id).maybeSingle(),
      supabase.from("category_scores").select("*, categories(number,name,weight_pct)").eq("submission_id", sub.id).order("categories(number)"),
    ]);
    setResponses(resp || []);
    const scoreData = overall ? { overall, categories: catScores || [] } : null;
    setExistingScore(scoreData);
    if (sub.status === "approved" && !overall) {
      try {
        const result = await runScoringEngine(sub.id);
        setScoreResult(result);
        const { data: nc } = await supabase.from("category_scores").select("*, categories(number,name,weight_pct)").eq("submission_id", sub.id).order("categories(number)");
        const { data: no } = await supabase.from("overall_scores").select("*").eq("submission_id", sub.id).maybeSingle();
        setExistingScore({ overall: no, categories: nc || [] });
      } catch (e) {}
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setSaving(true);
    try {
      const update: any = { status };
      if (status === "approved") {
        update.approved_at = new Date().toISOString();
        setScoring(true);
        try {
          const result = await runScoringEngine(id);
          setScoreResult(result);
          const { data: nc } = await supabase.from("category_scores").select("*, categories(number,name,weight_pct)").eq("submission_id", id).order("categories(number)");
          const { data: no } = await supabase.from("overall_scores").select("*").eq("submission_id", id).maybeSingle();
          setExistingScore({ overall: no, categories: nc || [] });
          toast({ title: `✓ Approved — Score: ${result.total_score}/100`, description: `${result.completeness_pct}% of metrics answered` });
        } catch (e: any) {
          toast({ title: "Approved — scoring failed", description: e.message, variant: "destructive" });
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

  const tree = buildTree();

  const toggleSupplier = (id: string) => setExpandedSuppliers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCountry = (id: string) => setExpandedCountries(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleLocation = (id: string) => setExpandedLocations(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Status summary badge counts for a list of submissions
  const statusSummary = (subs: any[]) => {
    const counts: Record<string, number> = {};
    subs.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return counts;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .rp-grid{display:grid;grid-template-columns:340px 1fr;gap:20px}
        @media(max-width:900px){.rp-grid{grid-template-columns:1fr}}
        .rp-tree-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .rp-tree-hdr{padding:12px 16px;border-bottom:1px solid #F1F5F9;background:#FAFBFC;display:flex;align-items:center;justify-content:space-between}
        .rp-tree-title{font-size:13px;font-weight:700;color:#0F1B2D}
        .rp-tree-cnt{font-size:11.5px;font-weight:600;background:#EFF6FF;color:#2563EB;padding:2px 8px;border-radius:12px}
        .rp-tree-body{overflow-y:auto;max-height:calc(100vh - 200px)}

        /* Supplier row */
        .rp-sup{cursor:pointer;user-select:none}
        .rp-sup-row{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#F8FAFC;border-bottom:1px solid #E8EEF4;transition:background 0.1s}
        .rp-sup-row:hover{background:#EFF6FF}
        .rp-sup-name{font-size:13px;font-weight:700;color:#0F1B2D;flex:1}
        .rp-chevron{font-size:10px;color:#94A3B8;transition:transform 0.15s;display:inline-block}
        .rp-chevron.open{transform:rotate(90deg)}

        /* Country row */
        .rp-country{cursor:pointer;user-select:none}
        .rp-country-row{display:flex;align-items:center;gap:8px;padding:8px 14px 8px 28px;background:#fff;border-bottom:1px solid #F1F5F9;transition:background 0.1s}
        .rp-country-row:hover{background:#F8FAFC}
        .rp-country-name{font-size:12.5px;font-weight:600;color:#334155;flex:1}

        /* Location row */
        .rp-location{cursor:pointer;user-select:none}
        .rp-loc-row{display:flex;align-items:center;gap:8px;padding:7px 14px 7px 44px;background:#fff;border-bottom:1px solid #F8FAFC;transition:background 0.1s}
        .rp-loc-row:hover{background:#F8FAFC}
        .rp-loc-name{font-size:12px;font-weight:600;color:#475569;flex:1}

        /* Submission row */
        .rp-sub-row{display:flex;align-items:center;gap:8px;padding:7px 14px 7px 60px;cursor:pointer;border-bottom:1px solid #F8FAFC;transition:background 0.1s}
        .rp-sub-row:hover{background:#F8FAFC}
        .rp-sub-row.active{background:#EFF6FF}
        .rp-sub-period{font-size:12.5px;font-weight:500;color:#334155;flex:1}
        .rp-sub-score{font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px}
        .status-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:12px;font-size:10.5px;font-weight:700;white-space:nowrap;flex-shrink:0}
        .rp-status-pills{display:flex;gap:4px;flex-wrap:wrap}
        .rp-status-pill{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700}

        /* Detail panel */
        .rp-detail-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06);display:flex;flex-direction:column;min-height:400px}
        .rp-detail-hdr{padding:14px 20px;border-bottom:1px solid #F1F5F9;flex-shrink:0}
        .rp-detail-sup{font-size:15px;font-weight:700;color:#0F1B2D}
        .rp-detail-meta{font-size:12px;color:#64748B;margin-top:3px}
        .rp-detail-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
        .rp-stat-lbl{font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
        .rp-stat-val{font-size:13px;font-weight:600;color:#0F1B2D;margin-top:2px}
        .rp-score-panel{padding:14px 20px;border-bottom:1px solid #F1F5F9;background:#F8FAFC}
        .rp-score-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .rp-score-lbl{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em}
        .rp-score-total{font-size:28px;font-weight:800;letter-spacing:-0.03em;line-height:1}
        .rp-score-bar-wrap{height:5px;background:#E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:10px}
        .rp-score-bar{height:100%;border-radius:10px;transition:width 0.5s ease}
        .rp-cat-scores{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        .rp-cat-item{background:#fff;border:1px solid #E2E8F0;border-radius:7px;padding:7px 10px}
        .rp-cat-name{font-size:10px;font-weight:600;color:#64748B;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rp-cat-pts{font-size:12.5px;font-weight:700;color:#0F1B2D}
        .rp-cat-pct{font-size:10px;color:#94A3B8;margin-left:3px}
        .rp-cat-bar{height:3px;border-radius:6px;margin-top:4px}
        .rp-responses{overflow-y:auto;max-height:220px}
        .rp-resp-tbl{width:100%;border-collapse:collapse}
        .rp-resp-tbl thead th{background:#F8FAFC;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:left}
        .rp-resp-tbl thead th.r{text-align:right}
        .rp-resp-tbl tbody tr{border-bottom:1px solid #F8FAFC}
        .rp-resp-tbl tbody tr:last-child{border-bottom:none}
        .rp-resp-tbl tbody tr.flagged{background:#FFF8F8}
        .rp-resp-tbl td{padding:8px 14px;font-size:12.5px;color:#334155}
        .rp-resp-tbl td.r{text-align:right;font-weight:600}
        .rp-actions{padding:12px 20px;border-top:1px solid #F1F5F9;background:#FAFBFC;flex-shrink:0}
        .rp-btn-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .rp-btn{height:32px;padding:0 14px;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all 0.15s}
        .rp-btn-approve{background:#DCFCE7;color:#15803D;border:1.5px solid #BBF7D0}
        .rp-btn-approve:hover{background:#059669;color:#fff;border-color:#059669}
        .rp-btn-flag{background:#FEE2E2;color:#B91C1C;border:1.5px solid #FECACA}
        .rp-btn-flag:hover{background:#DC2626;color:#fff;border-color:#DC2626}
        .rp-btn-reset{background:#F8FAFC;color:#475569;border:1.5px solid #E2E8F0}
        .rp-btn-reset:hover{background:#E2E8F0;color:#0F1B2D}
        .rp-btn-delete{background:#fff;color:#DC2626;border:1.5px solid #FECACA;margin-left:auto}
        .rp-btn-delete:hover{background:#FEE2E2}
        .rp-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;color:#94A3B8;gap:10px}
        .rp-modal-ov{position:fixed;inset:0;background:rgba(15,27,45,0.4);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}
        .rp-modal{background:#fff;border-radius:14px;padding:28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(15,27,45,0.2)}
        .rp-modal h4{font-size:16px;font-weight:700;color:#0F1B2D;margin:0 0 10px}
        .rp-modal p{font-size:13.5px;color:#64748B;line-height:1.6;margin:0 0 20px}
        .rp-modal-acts{display:flex;gap:10px;justify-content:flex-end}
        .rp-no-score{padding:10px 20px;border-bottom:1px solid #F1F5F9;font-size:12.5px;color:#94A3B8;font-style:italic}
      `}</style>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>Loading submissions…</div>
      ) : (
        <div className="rp-grid">

          {/* ── LEFT: Grouped tree ──────────────────────────────────────── */}
          <div className="rp-tree-card">
            <div className="rp-tree-hdr">
              <span className="rp-tree-title">Submissions</span>
              <span className="rp-tree-cnt">{submissions.length}</span>
            </div>
            {submissions.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>No submissions yet.</div>
            ) : (
              <div className="rp-tree-body">
                {Object.values(tree).map(supplier => {
                  const supOpen = expandedSuppliers.has(supplier.supplier_id);
                  const allSupSubs = Object.values(supplier.countries).flatMap(c => Object.values(c.locations).flatMap(l => l.submissions));
                  const supCounts = statusSummary(allSupSubs);

                  return (
                    <div key={supplier.supplier_id} className="rp-sup">
                      {/* Supplier row */}
                      <div className="rp-sup-row" onClick={() => toggleSupplier(supplier.supplier_id)}>
                        <span className="rp-chevron" style={{ transform: supOpen ? "rotate(90deg)" : "" }}>▶</span>
                        <span className="rp-sup-name">{supplier.name}</span>
                        <div className="rp-status-pills">
                          {Object.entries(supCounts).map(([st, cnt]) => {
                            const cfg = ST[st] || ST.draft;
                            return <span key={st} className="rp-status-pill" style={{ background: cfg.bg, color: cfg.color }}>{cnt} {cfg.label}</span>;
                          })}
                        </div>
                      </div>

                      {supOpen && Object.values(supplier.countries).map(country => {
                        const countryKey = `${supplier.supplier_id}/${country.country_id}`;
                        const countryOpen = expandedCountries.has(countryKey);
                        const allCountrySubs = Object.values(country.locations).flatMap(l => l.submissions);
                        const countryCounts = statusSummary(allCountrySubs);

                        return (
                          <div key={country.country_id} className="rp-country">
                            {/* Country row */}
                            <div className="rp-country-row" onClick={() => toggleCountry(countryKey)}>
                              <span className="rp-chevron" style={{ transform: countryOpen ? "rotate(90deg)" : "" }}>▶</span>
                              <span className="rp-country-name">🌍 {country.name}</span>
                              <div className="rp-status-pills">
                                {Object.entries(countryCounts).map(([st, cnt]) => {
                                  const cfg = ST[st] || ST.draft;
                                  return <span key={st} className="rp-status-pill" style={{ background: cfg.bg, color: cfg.color }}>{cnt}</span>;
                                })}
                              </div>
                            </div>

                            {countryOpen && Object.values(country.locations).map(location => {
                              const locKey = `${supplier.supplier_id}/${country.country_id}/${location.location_id}`;
                              const locOpen = expandedLocations.has(locKey);
                              const locCounts = statusSummary(location.submissions);

                              return (
                                <div key={location.location_id} className="rp-location">
                                  {/* Location row */}
                                  <div className="rp-loc-row" onClick={() => toggleLocation(locKey)}>
                                    <span className="rp-chevron" style={{ transform: locOpen ? "rotate(90deg)" : "" }}>▶</span>
                                    <span className="rp-loc-name">📍 {location.name}</span>
                                    <div className="rp-status-pills">
                                      {Object.entries(locCounts).map(([st, cnt]) => {
                                        const cfg = ST[st] || ST.draft;
                                        return <span key={st} className="rp-status-pill" style={{ background: cfg.bg, color: cfg.color }}>{cnt}</span>;
                                      })}
                                    </div>
                                  </div>

                                  {/* Submission rows — sorted by year/month */}
                                  {locOpen && [...location.submissions]
                                    .sort((a, b) => a.reporting_year !== b.reporting_year
                                      ? a.reporting_year - b.reporting_year
                                      : a.reporting_month - b.reporting_month)
                                    .map(sub => {
                                      const cfg = ST[sub.status] || ST.draft;
                                      return (
                                        <div
                                          key={sub.id}
                                          className={`rp-sub-row ${selected?.id === sub.id ? "active" : ""}`}
                                          onClick={() => loadResponses(sub)}
                                        >
                                          <span className="rp-sub-period">
                                            {SHORT_MONTHS[sub.reporting_month]} {sub.reporting_year}
                                          </span>
                                          <span className="status-badge" style={{ background: cfg.bg, color: cfg.color }}>
                                            {cfg.label}
                                          </span>
                                        </div>
                                      );
                                    })}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT: Detail panel ─────────────────────────────────────── */}
          <div className="rp-detail-card">
            {!selected ? (
              <div className="rp-placeholder">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M4 10h24M4 16h16M4 22h10" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round"/></svg>
                <span style={{ fontSize: 13 }}>Select a submission to review</span>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="rp-detail-hdr">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div className="rp-detail-sup">{selected.suppliers?.name}</div>
                      <div className="rp-detail-meta">
                        {selected.locations?.name} · {selected.countries?.country_name} · {SHORT_MONTHS[selected.reporting_month]} {selected.reporting_year}
                      </div>
                    </div>
                    {(() => { const cfg = ST[selected.status] || ST.draft; return <span className="status-badge" style={{ background: cfg.bg, color: cfg.color, fontSize: 12, padding: "3px 10px" }}>{cfg.label}</span>; })()}
                  </div>
                  <div className="rp-detail-stats">
                    <div><div className="rp-stat-lbl">Submitted by</div><div className="rp-stat-val">{selected.submitted_by || "—"}</div></div>
                    <div><div className="rp-stat-lbl">Reviewed by</div><div className="rp-stat-val">{selected.reviewed_by || "—"}</div></div>
                    <div><div className="rp-stat-lbl">Date</div><div className="rp-stat-val">{selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString() : "—"}</div></div>
                    <div><div className="rp-stat-lbl">Responses</div><div className="rp-stat-val">{responses.length} recorded</div></div>
                  </div>
                </div>

                {/* Score */}
                {displayScore ? (
                  <div className="rp-score-panel">
                    <div className="rp-score-top">
                      <div>
                        <div className="rp-score-lbl">Overall Score</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 3 }}>
                          <span className="rp-score-total" style={{ color: sc(displayScore.total) }}>{displayScore.total}</span>
                          <span style={{ fontSize: 13, color: "#94A3B8" }}>/100</span>
                        </div>
                        {displayScore.completeness !== null && <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>{displayScore.completeness}% answered</div>}
                      </div>
                    </div>
                    <div className="rp-score-bar-wrap">
                      <div className="rp-score-bar" style={{ width: `${Math.min(displayScore.total, 100)}%`, background: sc(displayScore.total) }} />
                    </div>
                    <div className="rp-cat-scores">
                      {(displayScore.categories as any[]).map((cs, ci) => {
                        const name = cs.category_name || cs.categories?.name || `Cat ${ci + 1}`;
                        const pts = cs.normalized_score ?? cs.points_earned ?? 0;
                        const max = cs.category_weight ?? cs.categories?.weight_pct ?? 0;
                        const pct = max > 0 ? Math.round((pts / max) * 100) : 0;
                        return (
                          <div key={cs.category_id} className="rp-cat-item">
                            <div className="rp-cat-name" title={name}>{name}</div>
                            <div><span className="rp-cat-pts">{pts}</span><span className="rp-cat-pct">/ {max} ({pct}%)</span></div>
                            <div className="rp-cat-bar" style={{ background: "#E2E8F0" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: CAT_COLORS[ci % CAT_COLORS.length], borderRadius: 6 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rp-no-score">No score yet — approve to calculate</div>
                )}

                {/* Responses */}
                <div className="rp-responses">
                  {responses.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "#94A3B8", fontSize: 12.5 }}>No responses recorded.</div>
                  ) : (
                    <table className="rp-resp-tbl">
                      <thead><tr><th>Metric</th><th className="r">Value</th><th className="r">Pts</th></tr></thead>
                      <tbody>
                        {responses.map(r => {
                          const m = getMetric(r.metric_id);
                          const val = r.value_likert ?? r.value_numeric;
                          return (
                            <tr key={r.id} className={r.is_flagged ? "flagged" : ""}>
                              <td>{m?.name || "—"}{r.is_flagged && <span style={{ marginLeft: 5, color: "#DC2626", fontSize: 11 }}>⚠</span>}</td>
                              <td className="r">{val ?? "—"}{m?.input_type === "percent" ? "%" : ""}{m?.input_type === "likert" ? "/5" : ""}</td>
                              <td className="r" style={{ color: r.points_earned === 0 ? "#DC2626" : "#059669" }}>{r.points_earned ?? "—"}</td>
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
                        {scoring ? "Scoring…" : "✓ Approve"}
                      </button>
                    )}
                    {selected.status !== "flagged" && <button className="rp-btn rp-btn-flag" onClick={() => updateStatus(selected.id, "flagged")} disabled={saving}>⚠ Flag</button>}
                    {selected.status !== "submitted" && <button className="rp-btn rp-btn-reset" onClick={() => updateStatus(selected.id, "submitted")} disabled={saving}>↩ Reset</button>}
                    <button className="rp-btn rp-btn-delete" onClick={() => setDeleteTarget(selected)}>Delete</button>
                  </div>
                  {selected.status === "approved" && <div style={{ fontSize: 12, color: "#059669", fontWeight: 500, marginTop: 8 }}>✓ Approved — scores calculated automatically</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div className="rp-modal-ov" onClick={() => setDeleteTarget(null)}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>
            <h4>Delete this submission?</h4>
            <p>Permanently delete <strong>{deleteTarget?.suppliers?.name}</strong> — {SHORT_MONTHS[deleteTarget?.reporting_month]} {deleteTarget?.reporting_year}. All responses, scores and flags will be deleted.</p>
            <div className="rp-modal-acts">
              <button style={{ height: 38, padding: "0 16px", background: "#fff", color: "#475569", border: "1.5px solid #CBD5E1", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button style={{ height: 38, padding: "0 16px", background: "#FEF2F2", color: "#DC2626", border: "1.5px solid #FECACA", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }} onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
