// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { supabase, SHORT_MONTHS, CAT_COLORS } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Filters {
  supplier_id: string;
  country_id: string;
  location_id: string;
  year: string;
  month_from: string;
  month_to: string;
}

const EMPTY_FILTERS: Filters = {
  supplier_id: "", country_id: "", location_id: "",
  year: String(new Date().getFullYear()),
  month_from: "1", month_to: "12",
};

const SEL = `height:36px;padding:0 10px;border:1.5px solid #CBD5E1;border-radius:7px;font-size:13px;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:28px;background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center`;


// ─────────────────────────────────────────────────────────────────────────────
// TREND CHART — SVG stacked bars + connecting lines per category
// ─────────────────────────────────────────────────────────────────────────────
function TrendChart({ trend, catColors, scoreColor, scoreBg }: any) {
  const COL_W = 80;
  const BAR_W = 48;
  const CHART_H = 180;  // height of each chart
  const PAD_L = 44;
  const PAD_T = 12;
  const PAD_B = 28;     // bottom for month labels
  const plotH = CHART_H - PAD_T - PAD_B;
  const totalW = Math.max(trend.length * COL_W + PAD_L + 20, 400);

  // All unique categories sorted by number
  const allCats: any[] = [];
  const catSeen = new Set<string>();
  trend.forEach((t: any) => {
    t.cats.forEach((c: any) => {
      if (!catSeen.has(c.cid)) { catSeen.add(c.cid); allCats.push(c); }
    });
  });
  allCats.sort((a, b) => a.number - b.number);

  const BASE_Y = PAD_T + plotH;  // bottom of bars
  const MAX_LSP = 55;
  const MAX_INT = 45;

  const colX = (mi: number) => PAD_L + mi * COL_W + COL_W / 2;
  const barLeft = (mi: number) => colX(mi) - BAR_W / 2;

  const lspBarH = (pts: number, maxH: number) => Math.max((pts / MAX_LSP) * maxH, pts > 0 ? 2 : 0);
  const intBarH = (pts: number, maxH: number) => Math.max((pts / MAX_INT) * maxH, pts > 0 ? 2 : 0);

  // Compute segment centre Y for connecting dots
  const segCentreY = (mi: number, cid: string, type: "lsp"|"int") => {
    const t = trend[mi];
    const cats = t.cats
      .filter((c: any) => type === "lsp" ? c.lspAvg > 0 : c.intAvg > 0)
      .sort((a: any, b: any) => a.number - b.number);
    let cum = 0;
    for (const c of cats) {
      const h = type === "lsp" ? lspBarH(c.lspAvg, plotH) : intBarH(c.intAvg, plotH);
      if (c.cid === cid) return BASE_Y - cum - h / 2;
      cum += h;
    }
    return null;
  };

  const renderChart = (type: "lsp" | "int", title: string, subtitle: string) => {
    const maxPts = type === "lsp" ? MAX_LSP : MAX_INT;
    const getH = (pts: number) => type === "lsp" ? lspBarH(pts, plotH) : intBarH(pts, plotH);
    const getAvg = (c: any) => type === "lsp" ? c.lspAvg : c.intAvg;

    return (
      <div style={{ marginBottom: 4 }}>
        {/* Chart title */}
        <div style={{ padding: "10px 20px 0", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0F1B2D" }}>{title}</span>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>{subtitle}</span>
        </div>

        <svg width={totalW} height={CHART_H} style={{ display: "block", minWidth: "100%", overflow: "visible" }}>
          {/* Horizontal guide lines */}
          {[0, 25, 50, 75, 100].map(pct => {
            const y = BASE_Y - (pct / 100) * plotH;
            return (
              <g key={pct}>
                <line x1={PAD_L} x2={totalW - 10} y1={y} y2={y} stroke="#F1F5F9" strokeWidth={1} />
                <text x={PAD_L - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#CBD5E1">
                  {Math.round(pct / 100 * maxPts)}
                </text>
              </g>
            );
          })}

          {/* Connecting lines per category */}
          {allCats.map((cat, ci) => {
            const color = catColors[ci % catColors.length];
            const points: { x: number; y: number }[] = [];
            trend.forEach((t: any, mi: number) => {
              const c = t.cats.find((c: any) => c.cid === cat.cid && getAvg(c) > 0);
              if (!c) return;
              const y = segCentreY(mi, cat.cid, type);
              if (y !== null) points.push({ x: colX(mi), y });
            });
            return points.length > 1 ? points.map((pt, pi) => pi < points.length - 1 ? (
              <line key={`${cat.cid}-${pi}`}
                x1={pt.x} y1={pt.y} x2={points[pi + 1].x} y2={points[pi + 1].y}
                stroke={color} strokeWidth={1.5} strokeOpacity={0.4} />
            ) : null) : null;
          })}

          {/* Stacked bars */}
          {trend.map((t: any, mi: number) => {
            const cats = t.cats.filter((c: any) => getAvg(c) > 0).sort((a: any, b: any) => a.number - b.number);
            let cum = 0;
            const rects = cats.map((c: any) => {
              const h = getH(getAvg(c));
              const y = BASE_Y - cum - h;
              cum += h;
              const catIdx = allCats.findIndex(ac => ac.cid === c.cid);
              return (
                <rect key={c.cid} x={barLeft(mi)} y={y} width={BAR_W} height={h}
                  fill={catColors[catIdx % catColors.length]} opacity={0.85} rx={1}>
                  <title>{c.name}: {getAvg(c).toFixed(1)} / {c.weight} pts</title>
                </rect>
              );
            });

            // Total score label
            const total = cats.reduce((s: number, c: any) => s + getAvg(c), 0);

            return (
              <g key={t.key}>
                {rects}
                {/* Dot markers on connecting lines */}
                {allCats.map((cat, ci) => {
                  const c = t.cats.find((c: any) => c.cid === cat.cid && getAvg(c) > 0);
                  if (!c) return null;
                  const y = segCentreY(mi, cat.cid, type);
                  if (y === null) return null;
                  return <circle key={cat.cid} cx={colX(mi)} cy={y} r={2.5}
                    fill={catColors[ci % catColors.length]} stroke="#fff" strokeWidth={1} />;
                })}
                {/* Month label */}
                <text x={colX(mi)} y={CHART_H - 4} textAnchor="middle"
                  fontSize={10} fill="#94A3B8" fontFamily="DM Sans,sans-serif">
                  {t.label}
                </text>
                {/* Section total */}
                {total > 0 && (
                  <text x={colX(mi)} y={BASE_Y + 13} textAnchor="middle"
                    fontSize={9} fontWeight="700" fill="#64748B" fontFamily="DM Sans,sans-serif">
                    {total.toFixed(1)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "12px 20px", borderBottom: "1px solid #F1F5F9", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Categories:</span>
        {allCats.map((c, i) => (
          <div key={c.cid} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: catColors[i % catColors.length], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#64748B" }}>{c.name}</span>
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        {/* Chart 1: Supplier KPIs */}
        {renderChart("lsp", "Supplier KPIs", "Numeric metrics — %, counts")}

        {/* Divider */}
        <div style={{ height: 1, background: "#E2E8F0", margin: "4px 20px" }} />

        {/* Chart 2: Internal Ratings */}
        {renderChart("int", "Internal Ratings", "Likert assessments")}

        {/* Total score row */}
        <div style={{ overflowX: "auto" }}>
          <svg width={totalW} height={32} style={{ display: "block", minWidth: "100%" }}>
            <line x1={PAD_L} x2={totalW - 10} y1={1} y2={1} stroke="#E2E8F0" strokeWidth={1} />
            {trend.map((t: any, mi: number) => (
              <g key={t.key}>
                <text x={colX(mi)} y={21} textAnchor="middle"
                  fontSize={12} fontWeight="800" fill={scoreColor(t.avg)}
                  fontFamily="DM Sans,sans-serif">
                  {t.avg}
                </text>
              </g>
            ))}
            <text x={PAD_L - 4} y={21} textAnchor="end" fontSize={9}
              fontWeight="700" fill="#475569" fontFamily="DM Sans,sans-serif">Total</text>
          </svg>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportingDashboard() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Data states
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [overallScores, setOverallScores] = useState<any[]>([]);
  const [categoryScores, setCategoryScores] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);

  // Drill-down state
  const [drillSub, setDrillSub] = useState<any>(null); // selected submission for drill-down
  const [drillCat, setDrillCat] = useState<string | null>(null); // selected category for drill-down

  // View mode
  const [view, setView] = useState<"trend"|"locations"|"categories"|"detail">("trend");

  // ── Load reference data ───────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name").eq("status","active").order("name"),
      supabase.from("categories").select("*").order("number"),
      supabase.from("metrics").select("id,number,name,category_id,input_type,max_points,reported_by").order("number"),
    ]).then(([s, c, m]) => {
      setSuppliers(s.data || []);
      setCategories(c.data || []);
      setMetrics(m.data || []);
    });
  }, []);

  useEffect(() => {
    if (filters.supplier_id) {
      supabase.from("countries").select("id,country_name").eq("supplier_id", filters.supplier_id).order("country_name")
        .then(({ data }) => setCountries(data || []));
      setFilters(f => ({ ...f, country_id: "", location_id: "" }));
    } else {
      setCountries([]);
    }
  }, [filters.supplier_id]);

  useEffect(() => {
    if (filters.country_id) {
      supabase.from("locations").select("id,name").eq("country_id", filters.country_id).eq("status","active").order("name")
        .then(({ data }) => setLocations(data || []));
      setFilters(f => ({ ...f, location_id: "" }));
    } else {
      setLocations([]);
    }
  }, [filters.country_id]);

  // ── Load scoring data ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!filters.supplier_id) return;
    setLoading(true);
    setDrillSub(null);
    setDrillCat(null);

    // Build submission query
    let subQuery = supabase
      .from("submissions")
      .select("id,reporting_month,reporting_year,status,submitted_by,submitted_at,supplier_id,country_id,location_id,suppliers(name),countries(country_name),locations(name)")
      .eq("supplier_id", filters.supplier_id)
      .eq("reporting_year", Number(filters.year))
      .gte("reporting_month", Number(filters.month_from))
      .lte("reporting_month", Number(filters.month_to))
      .in("status", ["submitted","flagged","approved"])
      .order("reporting_year").order("reporting_month");

    if (filters.country_id) subQuery = subQuery.eq("country_id", filters.country_id);
    if (filters.location_id) subQuery = subQuery.eq("location_id", filters.location_id);

    const { data: subs } = await subQuery;
    const subIds = (subs || []).map(s => s.id);
    setSubmissions(subs || []);

    if (!subIds.length) {
      setOverallScores([]); setCategoryScores([]); setResponses([]);
      setLoading(false);
      return;
    }

    const [{ data: overall }, { data: catScores }, { data: resp }] = await Promise.all([
      supabase.from("overall_scores").select("*").in("submission_id", subIds),
      supabase.from("category_scores").select("*,categories(id,number,name,weight_pct)").in("submission_id", subIds),
      supabase.from("responses").select("*,metrics(id,number,name,category_id,input_type,max_points)").in("submission_id", subIds),
    ]);

    setOverallScores(overall || []);
    setCategoryScores(catScores || []);
    setResponses(resp || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => { loadData(); }, [filters.supplier_id, filters.country_id, filters.location_id, filters.year, filters.month_from, filters.month_to]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const scoreFor = (subId: string) => overallScores.find(o => o.submission_id === subId);
  const catScoresFor = (subId: string) => categoryScores.filter(c => c.submission_id === subId);

  const scoreColor = (s: number) => s >= 80 ? "#059669" : s >= 60 ? "#D97706" : "#DC2626";
  const scoreBg = (s: number) => s >= 80 ? "#DCFCE7" : s >= 60 ? "#FEF3C7" : "#FEE2E2";

  // ── Aggregation helpers ───────────────────────────────────────────────────

  // Group submissions by location, compute avg score
  const locationAggregates = () => {
    const map: Record<string, { name: string; country: string; scores: number[]; months: Set<string> }> = {};
    submissions.forEach(sub => {
      const locId = sub.location_id;
      const score = scoreFor(sub.id);
      if (!score) return;
      if (!map[locId]) map[locId] = { name: sub.locations?.name || locId, country: sub.countries?.country_name || "—", scores: [], months: new Set() };
      map[locId].scores.push(Number(score.total_score));
      map[locId].months.add(`${sub.reporting_year}-${sub.reporting_month}`);
    });
    return Object.entries(map).map(([id, v]) => ({
      location_id: id,
      location_name: v.name,
      country_name: v.country,
      avg_score: v.scores.length ? Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 10) / 10 : null,
      min_score: v.scores.length ? Math.min(...v.scores) : null,
      max_score: v.scores.length ? Math.max(...v.scores) : null,
      months_count: v.months.size,
    })).sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));
  };

  // Group by country
  const countryAggregates = () => {
    const map: Record<string, { name: string; scores: number[]; locations: Set<string> }> = {};
    submissions.forEach(sub => {
      const score = scoreFor(sub.id);
      if (!score) return;
      const cid = sub.country_id;
      if (!map[cid]) map[cid] = { name: sub.countries?.country_name || cid, scores: [], locations: new Set() };
      map[cid].scores.push(Number(score.total_score));
      map[cid].locations.add(sub.location_id);
    });
    return Object.entries(map).map(([id, v]) => ({
      country_id: id,
      country_name: v.name,
      avg_score: v.scores.length ? Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 10) / 10 : null,
      locations_count: v.locations.size,
      submissions_count: v.scores.length,
    })).sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));
  };

  // Trend: monthly avg overall score
  const trendData = () => {
    // Map: month-key → { overall scores, per-category { lsp pts, internal pts, weight } }
    const map: Record<string, {
      scores: number[];
      count: number;
      cats: Record<string, { lspPts: number[]; intPts: number[]; weight: number; name: string; number: number }>;
    }> = {};

    submissions.forEach(sub => {
      const score = scoreFor(sub.id);
      if (!score) return;
      const key = `${sub.reporting_year}-${String(sub.reporting_month).padStart(2,"0")}`;
      if (!map[key]) map[key] = { scores: [], count: 0, cats: {} };
      map[key].scores.push(Number(score.total_score));
      map[key].count++;

      // Per-category scores for this submission
      const subCatScores = categoryScores.filter(cs => cs.submission_id === sub.id);
      subCatScores.forEach(cs => {
        const cid = cs.category_id;
        const cat = cs.categories;
        if (!map[key].cats[cid]) map[key].cats[cid] = {
          lspPts: [], intPts: [], weight: Number(cat?.weight_pct || 0),
          name: cat?.name || cid, number: Number(cat?.number || 0),
        };
        // Split: internal categories are those with Likert responses
        const subResponses = responses.filter(r => r.submission_id === sub.id && r.metrics?.category_id === cid);
        const hasLikert = subResponses.some(r => r.value_likert !== null && r.value_likert !== undefined);
        const pts = Number(cs.normalized_score || 0);
        if (hasLikert) map[key].cats[cid].intPts.push(pts);
        else map[key].cats[cid].lspPts.push(pts);
      });
    });

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => {
        const [year, month] = key.split("-");
        const avg = v.scores.length ? Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 10) / 10 : 0;
        const avgCats = Object.entries(v.cats).map(([cid, c]) => {
          const allPts = [...c.lspPts, ...c.intPts];
          const avgPts = allPts.length ? Math.round((allPts.reduce((a,b)=>a+b,0)/allPts.length)*10)/10 : 0;
          const lspAvg = c.lspPts.length ? Math.round((c.lspPts.reduce((a,b)=>a+b,0)/c.lspPts.length)*10)/10 : 0;
          const intAvg = c.intPts.length ? Math.round((c.intPts.reduce((a,b)=>a+b,0)/c.intPts.length)*10)/10 : 0;
          const pct = c.weight > 0 ? Math.round((avgPts / c.weight) * 100) : 0;
          return { cid, name: c.name, number: c.number, weight: c.weight, avgPts, lspAvg, intAvg, pct };
        }).sort((a,b) => a.number - b.number);
        return {
          key, label: `${SHORT_MONTHS[Number(month)]} ${year}`,
          avg, count: v.count,
          min: Math.min(...v.scores), max: Math.max(...v.scores),
          cats: avgCats,
        };
      });
  };

  // Category breakdown across all filtered submissions
  const categoryBreakdown = () => {
    const map: Record<string, { name: string; number: number; weight: number; scores: number[]; max: number }> = {};
    categoryScores.forEach(cs => {
      const cid = cs.category_id;
      const cat = cs.categories;
      if (!map[cid]) map[cid] = { name: cat?.name || cid, number: cat?.number || 0, weight: Number(cat?.weight_pct || 0), scores: [], max: Number(cat?.weight_pct || 0) };
      map[cid].scores.push(Number(cs.normalized_score || 0));
    });
    return Object.entries(map)
      .map(([id, v]) => ({
        category_id: id,
        name: v.name,
        number: v.number,
        weight: v.weight,
        avg_normalized: v.scores.length ? Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 10) / 10 : 0,
        pct_of_max: v.weight > 0 ? Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length / v.weight) * 100) : 0,
      }))
      .sort((a, b) => a.number - b.number);
  };

  // Metric breakdown for drill-down
  const metricBreakdown = (subId?: string, catId?: string) => {
    let relevant = responses;
    if (subId) relevant = relevant.filter(r => r.submission_id === subId);
    if (catId) relevant = relevant.filter(r => r.metrics?.category_id === catId);
    const map: Record<string, { name: string; number: number; values: number[]; points: number[]; max: number; type: string }> = {};
    relevant.forEach(r => {
      const mid = r.metric_id;
      const m = r.metrics;
      if (!m) return;
      if (!map[mid]) map[mid] = { name: m.name, number: m.number, values: [], points: [], max: Number(m.max_points), type: m.input_type };
      const val = r.value_likert ?? r.value_numeric;
      if (val !== null && val !== undefined) map[mid].values.push(Number(val));
      if (r.points_earned !== null) map[mid].points.push(Number(r.points_earned));
    });
    return Object.entries(map).map(([id, v]) => ({
      metric_id: id,
      name: v.name,
      number: v.number,
      max_points: v.max,
      input_type: v.type,
      avg_value: v.values.length ? Math.round((v.values.reduce((a, b) => a + b, 0) / v.values.length) * 10) / 10 : null,
      avg_points: v.points.length ? Math.round((v.points.reduce((a, b) => a + b, 0) / v.points.length) * 10) / 10 : null,
      pct_of_max: v.max > 0 && v.points.length ? Math.round((v.points.reduce((a, b) => a + b, 0) / v.points.length / v.max) * 100) : null,
      count: v.values.length,
    })).sort((a, b) => a.number - b.number);
  };

  const trend = trendData();
  const locAggs = locationAggregates();
  const countryAggs = countryAggregates();
  const catBreakdown = categoryBreakdown();
  const hasScores = overallScores.length > 0;
  const avgOverall = hasScores
    ? Math.round((overallScores.reduce((a, b) => a + Number(b.total_score), 0) / overallScores.length) * 10) / 10
    : null;

  const VIEWS = [
    { key: "trend", label: "Trend" },
    { key: "locations", label: "Locations" },
    { key: "categories", label: "Categories" },
    { key: "detail", label: "Detail" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .rd-filters{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:18px 20px;box-shadow:0 1px 3px rgba(15,27,45,0.06);display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
        .rd-filter-group{display:flex;flex-direction:column;gap:4px}
        .rd-filter-label{font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.04em}
        .rd-btn-load{height:36px;padding:0 18px;background:#2563EB;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;align-self:flex-end}
        .rd-btn-load:hover{background:#1D4ED8}
        .rd-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
        @media(max-width:700px){.rd-kpi-row{grid-template-columns:1fr 1fr}}
        .rd-kpi{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:16px 20px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .rd-kpi-label{font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px}
        .rd-kpi-value{font-size:28px;font-weight:800;letter-spacing:-0.03em;line-height:1}
        .rd-kpi-sub{font-size:12px;color:#94A3B8;margin-top:4px}
        .rd-view-tabs{display:flex;gap:2px;background:#F1F5F9;border-radius:10px;padding:3px;width:fit-content}
        .rd-view-tab{padding:7px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;background:none;color:#64748B;transition:all 0.15s;font-family:'DM Sans',sans-serif}
        .rd-view-tab:hover{color:#334155}
        .rd-view-tab.active{background:#fff;color:#2563EB;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
        .rd-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .rd-card-hdr{padding:14px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;background:#FAFBFC}
        .rd-card-title{font-size:13.5px;font-weight:700;color:#0F1B2D}
        .rd-card-sub{font-size:12px;color:#94A3B8}
        .rd-empty{padding:48px 20px;text-align:center;color:#94A3B8;font-size:13.5px}
        .rd-table{width:100%;border-collapse:collapse}
        .rd-table thead th{background:#F8FAFC;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:10px 16px;border-bottom:1px solid #E2E8F0;text-align:left;white-space:nowrap}
        .rd-table thead th.right{text-align:right}
        .rd-table tbody tr{border-bottom:1px solid #F8FAFC;cursor:pointer;transition:background 0.1s}
        .rd-table tbody tr:last-child{border-bottom:none}
        .rd-table tbody tr:hover{background:#F8FAFC}
        .rd-table tbody tr.selected{background:#EFF6FF}
        .rd-table td{padding:12px 16px;font-size:13.5px;color:#334155;vertical-align:middle}
        .rd-table td.name{font-weight:600;color:#0F1B2D}
        .rd-table td.right{text-align:right}
        .rd-score-pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700}
        .rd-bar-cell{width:120px}
        .rd-bar-bg{height:6px;background:#E2E8F0;border-radius:10px;overflow:hidden}
        .rd-bar-fill{height:100%;border-radius:10px;transition:width 0.4s ease}

        /* Trend chart */
        .rd-trend-wrap{padding:20px;overflow-x:auto}
        .rd-trend-chart{display:flex;align-items:flex-end;gap:8px;height:180px;min-width:100%}
        .rd-trend-col{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:48px}
        .rd-trend-bar-wrap{flex:1;display:flex;align-items:flex-end;width:100%}
        .rd-trend-bar{width:100%;border-radius:4px 4px 0 0;transition:height 0.4s ease;cursor:pointer;position:relative}
        .rd-trend-bar:hover{opacity:0.85}
        .rd-trend-bar-val{font-size:10px;font-weight:700;text-align:center;white-space:nowrap}
        .rd-trend-label{font-size:10px;color:#94A3B8;text-align:center;white-space:nowrap}
        .rd-trend-count{font-size:9.5px;color:#CBD5E1;text-align:center}

        /* Category radar-style bars */
        .rd-cat-bars{padding:16px 20px;display:flex;flex-direction:column;gap:10px}
        .rd-cat-bar-row{display:flex;align-items:center;gap:12px}
        .rd-cat-bar-name{font-size:12.5px;font-weight:600;color:#334155;width:200px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rd-cat-bar-track{flex:1;height:12px;background:#F1F5F9;border-radius:10px;overflow:hidden;cursor:pointer}
        .rd-cat-bar-track:hover .rd-cat-bar-fill{opacity:0.8}
        .rd-cat-bar-fill{height:100%;border-radius:10px;transition:width 0.5s ease}
        .rd-cat-bar-score{font-size:12px;font-weight:700;width:80px;text-align:right;flex-shrink:0}

        /* Drill-down */
        .rd-drill-hdr{padding:12px 20px;background:#EFF6FF;border-bottom:1px solid #BFDBFE;display:flex;align-items:center;gap:10px}
        .rd-drill-back{height:28px;padding:0 12px;background:#fff;color:#2563EB;border:1.5px solid #BFDBFE;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .rd-drill-title{font-size:13px;font-weight:700;color:#1D4ED8}

        /* Detail table */
        .rd-sub-row{padding:11px 16px;border-bottom:1px solid #F8FAFC;cursor:pointer;transition:background 0.1s;display:flex;align-items:center;gap:12px}
        .rd-sub-row:last-child{border-bottom:none}
        .rd-sub-row:hover{background:#F8FAFC}
        .rd-sub-row.active{background:#EFF6FF}
        .rd-loading{padding:48px;text-align:center;color:#94A3B8;font-size:13.5px;display:flex;flex-direction:column;align-items:center;gap:10px}
        .rd-spinner{width:24px;height:24px;border:2px solid #E2E8F0;border-top-color:#2563EB;border-radius:50%;animation:spin 0.7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="rd-filters">
        <div className="rd-filter-group">
          <div className="rd-filter-label">Supplier *</div>
          <select style={{cssText:SEL} as any} value={filters.supplier_id} onChange={e => setFilters(f=>({...f,supplier_id:e.target.value}))}>
            <option value="">— Select —</option>
            {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="rd-filter-group">
          <div className="rd-filter-label">Country</div>
          <select style={{cssText:SEL} as any} value={filters.country_id} disabled={!filters.supplier_id} onChange={e => setFilters(f=>({...f,country_id:e.target.value}))}>
            <option value="">All countries</option>
            {countries.map(c=><option key={c.id} value={c.id}>{c.country_name}</option>)}
          </select>
        </div>
        <div className="rd-filter-group">
          <div className="rd-filter-label">Location</div>
          <select style={{cssText:SEL} as any} value={filters.location_id} disabled={!filters.country_id} onChange={e => setFilters(f=>({...f,location_id:e.target.value}))}>
            <option value="">All locations</option>
            {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="rd-filter-group">
          <div className="rd-filter-label">Year</div>
          <select style={{cssText:SEL} as any} value={filters.year} onChange={e => setFilters(f=>({...f,year:e.target.value}))}>
            {[2024,2025,2026].map(y=><option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <div className="rd-filter-group">
          <div className="rd-filter-label">From month</div>
          <select style={{cssText:SEL} as any} value={filters.month_from} onChange={e => setFilters(f=>({...f,month_from:e.target.value}))}>
            {SHORT_MONTHS.slice(1).map((m,i)=><option key={i+1} value={String(i+1)}>{m}</option>)}
          </select>
        </div>
        <div className="rd-filter-group">
          <div className="rd-filter-label">To month</div>
          <select style={{cssText:SEL} as any} value={filters.month_to} onChange={e => setFilters(f=>({...f,month_to:e.target.value}))}>
            {SHORT_MONTHS.slice(1).map((m,i)=><option key={i+1} value={String(i+1)}>{m}</option>)}
          </select>
        </div>
      </div>

      {!filters.supplier_id ? (
        <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:12,padding:"48px 20px",textAlign:"center",color:"#94A3B8",fontSize:13.5}}>
          Select a supplier to view reporting data
        </div>
      ) : loading ? (
        <div className="rd-loading"><div className="rd-spinner"/><span>Loading data…</span></div>
      ) : (
        <>
          {/* ── KPI summary row ─────────────────────────────────────────── */}
          <div className="rd-kpi-row">
            <div className="rd-kpi">
              <div className="rd-kpi-label">Overall Score</div>
              <div className="rd-kpi-value" style={{color: avgOverall ? scoreColor(avgOverall) : "#CBD5E1"}}>
                {avgOverall ?? "—"}
              </div>
              <div className="rd-kpi-sub">avg / 100 pts</div>
            </div>
            <div className="rd-kpi">
              <div className="rd-kpi-label">Submissions</div>
              <div className="rd-kpi-value" style={{color:"#2563EB"}}>{submissions.length}</div>
              <div className="rd-kpi-sub">{new Set(submissions.map((s:any)=>s.location_id)).size} location{new Set(submissions.map((s:any)=>s.location_id)).size!==1?"s":""}</div>
            </div>
            <div className="rd-kpi">
              <div className="rd-kpi-label">Scored</div>
              <div className="rd-kpi-value" style={{color:"#0F1B2D"}}>{overallScores.length}</div>
              <div className="rd-kpi-sub">{submissions.length - overallScores.length} pending</div>
            </div>
            <div className="rd-kpi">
              <div className="rd-kpi-label">Period</div>
              <div className="rd-kpi-value" style={{fontSize:18,marginTop:4,color:"#0F1B2D"}}>
                {SHORT_MONTHS[Number(filters.month_from)]}–{SHORT_MONTHS[Number(filters.month_to)]}
              </div>
              <div className="rd-kpi-sub">{filters.year}</div>
            </div>
          </div>

          {/* ── View tabs ───────────────────────────────────────────────── */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <div className="rd-view-tabs">
              {VIEWS.map(v=>(
                <button key={v.key} className={`rd-view-tab ${view===v.key?"active":""}`} onClick={()=>{setView(v.key as any);setDrillSub(null);setDrillCat(null);}}>
                  {v.label}
                </button>
              ))}
            </div>
            {!hasScores && <div style={{fontSize:12.5,color:"#D97706",fontWeight:500}}>⚠ No scores yet — approve submissions to calculate scores</div>}
          </div>

          {/* ── TREND VIEW ──────────────────────────────────────────────── */}
          {view==="trend" && (
            <div className="rd-card">
              <div className="rd-card-hdr">
                <div>
                  <div className="rd-card-title">Score Trend — Category Breakdown</div>
                  <div className="rd-card-sub">Stacked bars per month split by supplier KPIs (bottom) and internal ratings (top) · Lines connect each category across months</div>
                </div>
              </div>
              {trend.length===0 ? <div className="rd-empty">No scored submissions in this period</div> : (
                <TrendChart trend={trend} catColors={CAT_COLORS} scoreColor={scoreColor} scoreBg={scoreBg} />
              )}
              {/* Summary table */}
              {trend.length>0 && (
                <table className="rd-table" style={{borderTop:"1px solid #F1F5F9"}}>
                  <thead><tr>
                    <th>Month</th>
                    <th className="right">Total Score</th>
                    <th className="right">Min</th>
                    <th className="right">Max</th>
                    <th className="right">Submissions</th>
                  </tr></thead>
                  <tbody>
                    {trend.map(t=>(
                      <tr key={t.key}>
                        <td className="name">{t.label}</td>
                        <td className="right"><span className="rd-score-pill" style={{background:scoreBg(t.avg),color:scoreColor(t.avg)}}>{t.avg}</span></td>
                        <td className="right" style={{color:"#64748B"}}>{t.min}</td>
                        <td className="right" style={{color:"#64748B"}}>{t.max}</td>
                        <td className="right" style={{color:"#64748B"}}>{t.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── LOCATIONS VIEW ──────────────────────────────────────────── */}
          {view==="locations" && (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {/* Country aggregates */}
              <div className="rd-card">
                <div className="rd-card-hdr">
                  <div><div className="rd-card-title">Country Aggregates</div><div className="rd-card-sub">Average score across all locations per country</div></div>
                </div>
                {countryAggs.length===0 ? <div className="rd-empty">No data</div> : (
                  <table className="rd-table">
                    <thead><tr><th>Country</th><th className="right">Avg Score</th><th className="right">Locations</th><th className="right">Submissions</th><th className="rd-bar-cell"></th></tr></thead>
                    <tbody>
                      {countryAggs.map(c=>(
                        <tr key={c.country_id}>
                          <td className="name">{c.country_name}</td>
                          <td className="right"><span className="rd-score-pill" style={{background:scoreBg(c.avg_score),color:scoreColor(c.avg_score)}}>{c.avg_score ?? "—"}</span></td>
                          <td className="right" style={{color:"#64748B"}}>{c.locations_count}</td>
                          <td className="right" style={{color:"#64748B"}}>{c.submissions_count}</td>
                          <td className="rd-bar-cell">
                            {c.avg_score && <div className="rd-bar-bg"><div className="rd-bar-fill" style={{width:`${c.avg_score}%`,background:scoreColor(c.avg_score)}}/></div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Location detail */}
              <div className="rd-card">
                <div className="rd-card-hdr">
                  <div><div className="rd-card-title">Location Detail</div><div className="rd-card-sub">Tap a location to drill into category scores</div></div>
                </div>
                {locAggs.length===0 ? <div className="rd-empty">No scored data</div> : (
                  <>
                    <table className="rd-table">
                      <thead><tr><th>Location</th><th>Country</th><th className="right">Avg</th><th className="right">Min</th><th className="right">Max</th><th className="right">Months</th><th className="rd-bar-cell"></th></tr></thead>
                      <tbody>
                        {locAggs.map(l=>(
                          <tr key={l.location_id} className={drillSub?.location_id===l.location_id?"selected":""} onClick={()=>{
                            const locSubs = submissions.filter(s=>s.location_id===l.location_id);
                            setDrillSub({...l, subs: locSubs});
                            setDrillCat(null);
                          }}>
                            <td className="name">{l.location_name}</td>
                            <td style={{color:"#64748B"}}>{l.country_name}</td>
                            <td className="right"><span className="rd-score-pill" style={{background:scoreBg(l.avg_score),color:scoreColor(l.avg_score)}}>{l.avg_score ?? "—"}</span></td>
                            <td className="right" style={{color:"#64748B"}}>{l.min_score}</td>
                            <td className="right" style={{color:"#64748B"}}>{l.max_score}</td>
                            <td className="right" style={{color:"#64748B"}}>{l.months_count}</td>
                            <td className="rd-bar-cell">
                              {l.avg_score && <div className="rd-bar-bg"><div className="rd-bar-fill" style={{width:`${l.avg_score}%`,background:scoreColor(l.avg_score)}}/></div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Location drill-down */}
                    {drillSub && (
                      <div style={{borderTop:"2px solid #E2E8F0"}}>
                        <div className="rd-drill-hdr">
                          <button className="rd-drill-back" onClick={()=>{setDrillSub(null);setDrillCat(null);}}>← Back</button>
                          <div className="rd-drill-title">📍 {drillSub.location_name} — {drillSub.country_name}</div>
                        </div>
                        {/* Category scores for this location */}
                        <div className="rd-cat-bars">
                          {catBreakdown.map((cb,ci)=>{
                            const locCatScores = categoryScores.filter(cs =>
                              drillSub.subs?.some((s:any) => s.id === cs.submission_id) && cs.category_id === cb.category_id
                            );
                            const avg = locCatScores.length
                              ? Math.round((locCatScores.reduce((a,b)=>a+Number(b.normalized_score||0),0)/locCatScores.length)*10)/10
                              : 0;
                            const pct = cb.weight > 0 ? (avg/cb.weight)*100 : 0;
                            return (
                              <div key={cb.category_id} className="rd-cat-bar-row" style={{cursor:"pointer"}} onClick={()=>setDrillCat(drillCat===cb.category_id?null:cb.category_id)}>
                                <div className="rd-cat-bar-name" title={cb.name}>{cb.number}. {cb.name}</div>
                                <div className="rd-cat-bar-track">
                                  <div className="rd-cat-bar-fill" style={{width:`${Math.min(pct,100)}%`,background:CAT_COLORS[ci%CAT_COLORS.length]}}/>
                                </div>
                                <div className="rd-cat-bar-score" style={{color:CAT_COLORS[ci%CAT_COLORS.length]}}>{avg}/{cb.weight}</div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Metric drill-down within category */}
                        {drillCat && (
                          <div style={{borderTop:"1px solid #F1F5F9"}}>
                            <div style={{padding:"10px 20px",fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",background:"#F8FAFC"}}>
                              {categories.find(c=>c.id===drillCat)?.name} — Question Detail
                            </div>
                            <table className="rd-table">
                              <thead><tr><th>#</th><th>Metric</th><th className="right">Avg Value</th><th className="right">Avg Pts</th><th className="right">% of Max</th><th className="right">Responses</th><th className="rd-bar-cell"></th></tr></thead>
                              <tbody>
                                {metricBreakdown(undefined, drillCat)
                                  .filter(m => drillSub.subs?.some((s:any) => responses.some(r=>r.submission_id===s.id && r.metric_id===m.metric_id)))
                                  .map(m=>(
                                  <tr key={m.metric_id}>
                                    <td style={{color:"#94A3B8",width:32}}>{m.number}</td>
                                    <td className="name">{m.name}</td>
                                    <td className="right">{m.avg_value ?? "—"}{m.input_type==="percent"?"%":m.input_type==="likert"?"/5":""}</td>
                                    <td className="right">{m.avg_points ?? "—"}</td>
                                    <td className="right">
                                      {m.pct_of_max !== null ? <span className="rd-score-pill" style={{background:scoreBg(m.pct_of_max),color:scoreColor(m.pct_of_max)}}>{m.pct_of_max}%</span> : "—"}
                                    </td>
                                    <td className="right" style={{color:"#64748B"}}>{m.count}</td>
                                    <td className="rd-bar-cell">
                                      {m.pct_of_max!==null && <div className="rd-bar-bg"><div className="rd-bar-fill" style={{width:`${m.pct_of_max}%`,background:m.pct_of_max>=80?"#059669":m.pct_of_max>=60?"#D97706":"#DC2626"}}/></div>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── CATEGORIES VIEW ─────────────────────────────────────────── */}
          {view==="categories" && (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="rd-card">
                <div className="rd-card-hdr">
                  <div><div className="rd-card-title">Category Breakdown</div><div className="rd-card-sub">Average score per category across all submissions. Tap a bar to drill into metrics.</div></div>
                </div>
                {catBreakdown.length===0 ? <div className="rd-empty">No scored data yet</div> : (
                  <>
                    <div className="rd-cat-bars" style={{padding:"20px 20px"}}>
                      {catBreakdown.map((cb,ci)=>(
                        <div key={cb.category_id} style={{cursor:"pointer"}} onClick={()=>setDrillCat(drillCat===cb.category_id?null:cb.category_id)}>
                          <div className="rd-cat-bar-row">
                            <div className="rd-cat-bar-name" title={cb.name} style={{fontSize:13,fontWeight:700,color:"#0F1B2D"}}>{cb.number}. {cb.name}</div>
                            <div style={{flex:1,height:16,background:"#F1F5F9",borderRadius:10,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${Math.min(cb.pct_of_max,100)}%`,background:CAT_COLORS[ci%CAT_COLORS.length],borderRadius:10,transition:"width 0.5s ease"}}/>
                            </div>
                            <div style={{fontSize:13,fontWeight:700,width:100,textAlign:"right",flexShrink:0,color:CAT_COLORS[ci%CAT_COLORS.length]}}>
                              {cb.avg_normalized}/{cb.weight} pts ({cb.pct_of_max}%)
                            </div>
                          </div>
                          {drillCat===cb.category_id && (
                            <div style={{marginTop:12,marginLeft:212,background:"#F8FAFC",borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0"}}>
                              <table className="rd-table" style={{fontSize:12.5}}>
                                <thead><tr><th>#</th><th>Metric</th><th className="right">Avg Value</th><th className="right">Avg Pts</th><th className="right">% of Max</th><th className="right">Count</th></tr></thead>
                                <tbody>
                                  {metricBreakdown(undefined, cb.category_id).map(m=>(
                                    <tr key={m.metric_id}>
                                      <td style={{color:"#94A3B8",width:32,padding:"9px 12px"}}>{m.number}</td>
                                      <td className="name" style={{padding:"9px 12px"}}>{m.name}</td>
                                      <td className="right" style={{padding:"9px 12px"}}>{m.avg_value ?? "—"}{m.input_type==="percent"?"%":m.input_type==="likert"?"/5":""}</td>
                                      <td className="right" style={{padding:"9px 12px"}}>{m.avg_points ?? "—"}/{m.max_points}</td>
                                      <td className="right" style={{padding:"9px 12px"}}>
                                        {m.pct_of_max!==null?<span className="rd-score-pill" style={{background:scoreBg(m.pct_of_max),color:scoreColor(m.pct_of_max)}}>{m.pct_of_max}%</span>:"—"}
                                      </td>
                                      <td className="right" style={{padding:"9px 12px",color:"#64748B"}}>{m.count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── DETAIL VIEW ─────────────────────────────────────────────── */}
          {view==="detail" && (
            <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16}}>
              {/* Submission list */}
              <div className="rd-card" style={{overflow:"hidden"}}>
                <div className="rd-card-hdr"><div className="rd-card-title">Submissions</div><div className="rd-card-sub">{submissions.length} total</div></div>
                <div style={{overflowY:"auto",maxHeight:600}}>
                  {submissions.length===0 ? <div className="rd-empty">No submissions</div> : submissions.map(sub=>{
                    const score = scoreFor(sub.id);
                    return (
                      <div key={sub.id} className={`rd-sub-row ${drillSub?.id===sub.id?"active":""}`} onClick={()=>{setDrillSub(sub);setDrillCat(null);}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#0F1B2D"}}>{sub.locations?.name}</div>
                          <div style={{fontSize:11.5,color:"#94A3B8",marginTop:2}}>{SHORT_MONTHS[sub.reporting_month]} {sub.reporting_year} · {sub.countries?.country_name}</div>
                        </div>
                        {score ? (
                          <span className="rd-score-pill" style={{background:scoreBg(score.total_score),color:scoreColor(score.total_score),fontSize:11}}>{score.total_score}</span>
                        ) : (
                          <span style={{fontSize:11,color:"#CBD5E1",fontWeight:500}}>No score</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submission detail */}
              <div className="rd-card">
                {!drillSub ? (
                  <div className="rd-empty">Select a submission to view detail</div>
                ) : (
                  <>
                    <div className="rd-card-hdr">
                      <div>
                        <div className="rd-card-title">{drillSub.locations?.name} — {SHORT_MONTHS[drillSub.reporting_month]} {drillSub.reporting_year}</div>
                        <div className="rd-card-sub">{drillSub.countries?.country_name} · {drillSub.submitted_by || "Unknown"}</div>
                      </div>
                      {scoreFor(drillSub.id) && (
                        <span style={{fontSize:22,fontWeight:800,color:scoreColor(scoreFor(drillSub.id).total_score)}}>
                          {scoreFor(drillSub.id).total_score}<span style={{fontSize:13,fontWeight:400,color:"#94A3B8"}}>/100</span>
                        </span>
                      )}
                    </div>

                    {/* Category scores with drill-down */}
                    <div className="rd-cat-bars" style={{borderBottom:"1px solid #F1F5F9"}}>
                      {catScoresFor(drillSub.id).sort((a,b)=>(a.categories?.number||0)-(b.categories?.number||0)).map((cs,ci)=>{
                        const pct = cs.categories?.weight_pct > 0 ? Math.round((cs.normalized_score/cs.categories.weight_pct)*100) : 0;
                        return (
                          <div key={cs.category_id} style={{cursor:"pointer"}} onClick={()=>setDrillCat(drillCat===cs.category_id?null:cs.category_id)}>
                            <div className="rd-cat-bar-row">
                              <div className="rd-cat-bar-name">{cs.categories?.number}. {cs.categories?.name}</div>
                              <div className="rd-cat-bar-track">
                                <div className="rd-cat-bar-fill" style={{width:`${Math.min(pct,100)}%`,background:CAT_COLORS[ci%CAT_COLORS.length]}}/>
                              </div>
                              <div className="rd-cat-bar-score" style={{color:CAT_COLORS[ci%CAT_COLORS.length]}}>
                                {cs.normalized_score}/{cs.categories?.weight_pct} ({pct}%)
                              </div>
                            </div>

                            {/* Metric detail on tap */}
                            {drillCat===cs.category_id && (
                              <div style={{marginTop:8,marginLeft:212,background:"#F8FAFC",borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0",marginBottom:4}}>
                                <table className="rd-table" style={{fontSize:12.5}}>
                                  <thead><tr><th>#</th><th>Question</th><th className="right">Value</th><th className="right">Points</th><th className="right">% Max</th></tr></thead>
                                  <tbody>
                                    {metricBreakdown(drillSub.id, cs.category_id).map(m=>(
                                      <tr key={m.metric_id}>
                                        <td style={{color:"#94A3B8",width:32,padding:"9px 12px"}}>{m.number}</td>
                                        <td className="name" style={{padding:"9px 12px"}}>{m.name}</td>
                                        <td className="right" style={{padding:"9px 12px"}}>{m.avg_value ?? "—"}{m.input_type==="percent"?"%":m.input_type==="likert"?"/5":""}</td>
                                        <td className="right" style={{padding:"9px 12px",fontWeight:600}}>{m.avg_points ?? "—"}/{m.max_points}</td>
                                        <td className="right" style={{padding:"9px 12px"}}>
                                          {m.pct_of_max!==null?<span className="rd-score-pill" style={{background:scoreBg(m.pct_of_max),color:scoreColor(m.pct_of_max)}}>{m.pct_of_max}%</span>:"—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* All responses */}
                    <div>
                      <div style={{padding:"10px 20px",fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.05em",background:"#FAFBFC",borderBottom:"1px solid #F1F5F9"}}>
                        All Responses ({responses.filter(r=>r.submission_id===drillSub.id).length})
                      </div>
                      <div style={{overflowY:"auto",maxHeight:280}}>
                        <table className="rd-table">
                          <thead><tr><th>#</th><th>Metric</th><th className="right">Value</th><th className="right">Points</th></tr></thead>
                          <tbody>
                            {responses.filter(r=>r.submission_id===drillSub.id)
                              .sort((a,b)=>(a.metrics?.number||0)-(b.metrics?.number||0))
                              .map(r=>(
                              <tr key={r.id} className={r.is_flagged?"":""} style={r.is_flagged?{background:"#FFF8F8"}:{}}>
                                <td style={{color:"#94A3B8",width:32}}>{r.metrics?.number}</td>
                                <td className="name">{r.metrics?.name || "—"}{r.is_flagged&&<span style={{marginLeft:6,color:"#DC2626",fontSize:11}}>⚠</span>}</td>
                                <td className="right">{r.value_likert ?? r.value_numeric ?? "—"}{r.metrics?.input_type==="percent"?"%":r.metrics?.input_type==="likert"?"/5":""}</td>
                                <td className="right" style={{fontWeight:600,color:r.points_earned===0?"#DC2626":"#059669"}}>{r.points_earned ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
