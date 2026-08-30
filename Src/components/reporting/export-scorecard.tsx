// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase, FULL_MONTHS, SHORT_MONTHS } from "@/lib/supabase";
import * as XLSX from "xlsx/dist/xlsx.full.min.js";


const SEL = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;width:100%;appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center`;
const LBL = { fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: "0.02em", textTransform: "uppercase" as const, marginBottom: 5 };

// ── Colour helpers (hex, no #) ──────────────────────────────────────────────
const CAT_COLORS_HEX = ["2563EB","F59E0B","10B981","8B5CF6","EF4444","06B6D4"];
const CAT_LIGHT     = ["DBEAFE","FEF3C7","D1FAE5","EDE9FE","FEE2E2","CFFAFE"];

function makeCell(v: any, s: any): any { return { v: v ?? "", t: typeof v === "number" ? "n" : "s", s } }

const ST = {
  navyHd: { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "0F1B2D" } }, alignment: { horizontal: "center", vertical: "center" } },
  monthHd: { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "1A2E4A" } }, alignment: { horizontal: "center", vertical: "center" } },
  catHd: (ci: number) => ({ font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: CAT_COLORS_HEX[ci % 6] } }, alignment: { horizontal: "left", vertical: "center" } }),
  metricName: { font: { color: { rgb: "0F1B2D" }, sz: 9 }, alignment: { horizontal: "left", vertical: "center", wrapText: true }, fill: { fgColor: { rgb: "FFFFFF" } } },
  metricNameGrey: { font: { color: { rgb: "94A3B8" }, sz: 9 }, alignment: { horizontal: "left", vertical: "center", wrapText: true }, fill: { fgColor: { rgb: "F8FAFC" } } },
  numCell: (ci: number) => ({ font: { color: { rgb: "0F1B2D" }, sz: 9 }, fill: { fgColor: { rgb: CAT_LIGHT[ci % 6] } }, alignment: { horizontal: "center", vertical: "center" } }),
  numCellGrey: { font: { color: { rgb: "CBD5E1" }, sz: 9 }, fill: { fgColor: { rgb: "F8FAFC" } }, alignment: { horizontal: "center", vertical: "center" } },
  totalRow: { font: { bold: true, color: { rgb: "0F1B2D" }, sz: 10 }, fill: { fgColor: { rgb: "E2E8F0" } }, alignment: { horizontal: "center", vertical: "center" } },
  totalLabel: { font: { bold: true, color: { rgb: "0F1B2D" }, sz: 10 }, fill: { fgColor: { rgb: "E2E8F0" } }, alignment: { horizontal: "left", vertical: "center" } },
  scoreGreen: { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "059669" } }, alignment: { horizontal: "center", vertical: "center" } },
  scoreAmber: { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "D97706" } }, alignment: { horizontal: "center", vertical: "center" } },
  scoreRed:   { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "DC2626" } }, alignment: { horizontal: "center", vertical: "center" } },
  numRef: { font: { color: { rgb: "94A3B8" }, sz: 9 }, alignment: { horizontal: "center", vertical: "center" } },
  catLabel: { font: { color: { rgb: "64748B" }, sz: 9 }, alignment: { horizontal: "left", vertical: "center" } },
  likertCell: (ci: number) => ({ font: { color: { rgb: "0F1B2D" }, sz: 10, bold: true }, fill: { fgColor: { rgb: CAT_LIGHT[ci % 6] } }, alignment: { horizontal: "center", vertical: "center" } }),
  likertGrey: { font: { color: { rgb: "CBD5E1" }, sz: 9 }, fill: { fgColor: { rgb: "F8FAFC" } }, alignment: { horizontal: "center", vertical: "center" } },
};

const scoreStyle = (score: number | null) => {
  if (score === null || score === undefined) return ST.totalRow;
  if (score >= 80) return ST.scoreGreen;
  if (score >= 60) return ST.scoreAmber;
  return ST.scoreRed;
};

// ── Build one worksheet (pivot matrix) ─────────────────────────────────────
function buildLocationSheet(
  wb: any,
  sheetName: string,
  locationName: string,
  supplierName: string,
  countryName: string,
  months: { key: string; label: string; submissionId: string | null; status: string }[],
  allMetrics: any[],       // all metrics sorted by number
  relevantIds: Set<string>,// metric IDs that are relevant for this location
  responsesByMonth: Record<string, Record<string, { val: any; pts: number | null }>>, // [monthKey][metricId]
  catScoresByMonth: Record<string, Record<string, number>>,  // [monthKey][categoryId]
  overallByMonth: Record<string, number>,
  categories: any[],
  type: "lsp" | "internal"
) {
  const ws: any = {};
  let r = 0;

  // Filter metrics by type
  const typeMetrics = allMetrics.filter(m =>
    type === "lsp" ? m.reported_by === "lsp" : m.reported_by === "internal"
  );

  const FIXED_COLS = 3; // #, Category, Metric Name
  const totalCols = FIXED_COLS + months.length;

  // ── Row 0: Header row ────────────────────────────────────────────────
  const encCell = (row: number, col: number) => XLSX.utils.encode_cell({ r: row, c: col });

  // Fixed headers
  ws[encCell(r, 0)] = makeCell("#", ST.navyHd);
  ws[encCell(r, 1)] = makeCell("Category", ST.navyHd);
  ws[encCell(r, 2)] = makeCell("Metric", ST.navyHd);
  // Month headers
  months.forEach((m, mi) => {
    ws[encCell(r, FIXED_COLS + mi)] = makeCell(m.label, ST.monthHd);
  });
  r++;

  // ── Metric rows grouped by category ─────────────────────────────────
  const catGroups = categories.map(cat => ({
    ...cat,
    metrics: typeMetrics.filter(m => m.category_id === cat.id),
  })).filter(c => c.metrics.length > 0);

  catGroups.forEach((cat, ci) => {
    // Category header row
    ws[encCell(r, 0)] = makeCell(cat.number, ST.catHd(ci));
    ws[encCell(r, 1)] = makeCell(cat.name, ST.catHd(ci));
    ws[encCell(r, 2)] = makeCell(`${cat.weight_pct}% · max ${cat.max_points} pts`, ST.catHd(ci));
    months.forEach((_, mi) => {
      ws[encCell(r, FIXED_COLS + mi)] = makeCell("", ST.catHd(ci));
    });
    r++;

    // Metric rows
    cat.metrics.forEach(m => {
      const isRelevant = relevantIds.has(m.id);
      const metStyle = isRelevant ? ST.metricName : ST.metricNameGrey;

      ws[encCell(r, 0)] = makeCell(m.number, isRelevant ? ST.numRef : ST.numCellGrey);
      ws[encCell(r, 1)] = makeCell(cat.name, ST.catLabel);
      ws[encCell(r, 2)] = makeCell(m.name, metStyle);

      months.forEach((mo, mi) => {
        const resp = responsesByMonth[mo.key]?.[m.id];
        let displayVal: any = "";
        if (!isRelevant) {
          ws[encCell(r, FIXED_COLS + mi)] = makeCell("—", ST.numCellGrey);
        } else if (!resp || resp.val === null || resp.val === undefined || resp.val === "") {
          ws[encCell(r, FIXED_COLS + mi)] = makeCell("", type === "lsp" ? ST.numCellGrey : ST.likertGrey);
        } else {
          displayVal = type === "lsp"
            ? `${resp.val}${m.input_type === "percent" ? "%" : ""}`
            : resp.val;
          ws[encCell(r, FIXED_COLS + mi)] = makeCell(
            displayVal,
            type === "lsp" ? ST.numCell(ci) : ST.likertCell(ci)
          );
        }
      });
      r++;
    });

    // Category score row
    ws[encCell(r, 0)] = makeCell("", ST.totalLabel);
    ws[encCell(r, 1)] = makeCell("", ST.totalLabel);
    ws[encCell(r, 2)] = makeCell(`↳ ${cat.name} score`, ST.totalLabel);
    months.forEach((mo, mi) => {
      const score = catScoresByMonth[mo.key]?.[cat.id];
      ws[encCell(r, FIXED_COLS + mi)] = makeCell(
        score !== undefined ? `${score}/${cat.weight_pct}` : "",
        score !== undefined ? scoreStyle((score / cat.weight_pct) * 100) : ST.totalRow
      );
    });
    r++;
  });

  // ── Overall score row ────────────────────────────────────────────────
  ws[encCell(r, 0)] = makeCell("", ST.totalLabel);
  ws[encCell(r, 1)] = makeCell("", ST.totalLabel);
  ws[encCell(r, 2)] = makeCell("OVERALL SCORE / 100", ST.totalLabel);
  months.forEach((mo, mi) => {
    const score = overallByMonth[mo.key];
    ws[encCell(r, FIXED_COLS + mi)] = makeCell(
      score !== undefined ? score : "",
      score !== undefined ? scoreStyle(score) : ST.totalRow
    );
  });
  r++;

  // ── Status row ───────────────────────────────────────────────────────
  ws[encCell(r, 0)] = makeCell("", ST.numRef);
  ws[encCell(r, 1)] = makeCell("", ST.numRef);
  ws[encCell(r, 2)] = makeCell("Status", { font: { color: { rgb: "64748B" }, sz: 9 }, alignment: { horizontal: "left" } });
  months.forEach((mo, mi) => {
    const st = mo.status || "—";
    const stColor = st === "approved" ? "059669" : st === "flagged" ? "DC2626" : st === "submitted" ? "D97706" : "94A3B8";
    ws[encCell(r, FIXED_COLS + mi)] = makeCell(
      st.charAt(0).toUpperCase() + st.slice(1),
      { font: { color: { rgb: stColor }, sz: 9, bold: true }, alignment: { horizontal: "center" } }
    );
  });
  r++;

  // Set range
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: totalCols - 1 } });

  // Column widths
  ws["!cols"] = [
    { wch: 5 },   // #
    { wch: 26 },  // Category
    { wch: 42 },  // Metric Name
    ...months.map(() => ({ wch: 14 })),
  ];

  // Row heights
  ws["!rows"] = [];
  // (set in loop below after building)

  const safeName = sheetName.substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeName);
}

export default function ExportScorecard() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selSupplier, setSelSupplier] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<"lsp"|"internal"|"both">("both");
  const [status, setStatus] = useState("");
  const toast = (opts: any) => {
    console.log("Toast:", opts.title, opts.description);
  };

  useEffect(() => {
    supabase.from("suppliers").select("id,name").eq("status","active").order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  const runExport = async () => {
    if (!selSupplier) return;
    setExporting(true);
    setStatus("Loading data…");

    try {
      // ── Fetch all reference data ──────────────────────────────────────
      const [
        { data: categories },
        { data: allMetrics },
        { data: locations },
        { data: relRows },
      ] = await Promise.all([
        supabase.from("categories").select("*").order("number"),
        supabase.from("metrics").select("*").order("number"),
        supabase.from("locations")
          .select("id,name,countries(id,country_name)")
          .eq("supplier_id", selSupplier)
          .eq("status","active")
          .order("name"),
        supabase.from("metric_relevance")
          .select("metric_id,location_id,is_relevant")
          .eq("supplier_id", selSupplier),
      ]);

      // ── Fetch all submissions for this supplier/year ──────────────────
      const { data: submissions } = await supabase
        .from("submissions")
        .select("id,location_id,reporting_month,reporting_year,status")
        .eq("supplier_id", selSupplier)
        .eq("reporting_year", Number(year))
        .order("reporting_month");

      if (!submissions?.length) {
        setStatus("No submissions found for this supplier/year.");
        setExporting(false);
        return;
      }

      const subIds = submissions.map(s => s.id);

      setStatus("Loading responses and scores…");

      const [
        { data: responses },
        { data: catScores },
        { data: overallScores },
      ] = await Promise.all([
        supabase.from("responses")
          .select("submission_id,metric_id,value_numeric,value_likert,points_earned")
          .in("submission_id", subIds),
        supabase.from("category_scores")
          .select("submission_id,category_id,normalized_score,points_earned,max_points_relevant")
          .in("submission_id", subIds),
        supabase.from("overall_scores")
          .select("submission_id,total_score")
          .in("submission_id", subIds),
      ]);

      setStatus("Building workbook…");

      // ── Build month columns (Jan–Dec, only months with data) ──────────
      const monthsWithData = new Set(submissions.map(s => s.reporting_month));
      const monthCols = Array.from({ length: 12 }, (_, i) => i + 1)
        .filter(m => monthsWithData.has(m))
        .map(m => ({
          key: `${year}-${m}`,
          label: `${SHORT_MONTHS[m]} ${year}`,
          month: m,
          year: Number(year),
        }));

      // ── Index submissions by location+month ───────────────────────────
      const subIndex: Record<string, { id: string; status: string }> = {};
      submissions.forEach(s => {
        subIndex[`${s.location_id}|${s.reporting_month}`] = { id: s.id, status: s.status };
      });

      // ── Index responses by submission → metric ────────────────────────
      const respIndex: Record<string, Record<string, { val: any; pts: number | null }>> = {};
      (responses || []).forEach(r => {
        if (!respIndex[r.submission_id]) respIndex[r.submission_id] = {};
        respIndex[r.submission_id][r.metric_id] = {
          val: r.value_numeric ?? r.value_likert,
          pts: r.points_earned,
        };
      });

      // ── Index category scores ─────────────────────────────────────────
      const catScoreIndex: Record<string, Record<string, number>> = {};
      (catScores || []).forEach(cs => {
        if (!catScoreIndex[cs.submission_id]) catScoreIndex[cs.submission_id] = {};
        catScoreIndex[cs.submission_id][cs.category_id] = Math.round(Number(cs.normalized_score) * 10) / 10;
      });

      // ── Index overall scores ──────────────────────────────────────────
      const overallIndex: Record<string, number> = {};
      (overallScores || []).forEach(os => {
        overallIndex[os.submission_id] = Math.round(Number(os.total_score) * 10) / 10;
      });

      // ── Build relevance map per location ─────────────────────────────
      const supplierDefaults: Record<string, boolean> = {};
      const locationOverrides: Record<string, Record<string, boolean>> = {};
      (relRows || []).forEach(r => {
        if (!r.location_id) {
          supplierDefaults[r.metric_id] = r.is_relevant;
        } else {
          if (!locationOverrides[r.location_id]) locationOverrides[r.location_id] = {};
          locationOverrides[r.location_id][r.metric_id] = r.is_relevant;
        }
      });

      const getRelevantIds = (locationId: string): Set<string> => {
        const relevant = new Set<string>();
        (allMetrics || []).forEach(m => {
          let isRel = true;
          if (supplierDefaults[m.id] !== undefined) isRel = supplierDefaults[m.id];
          if (locationOverrides[locationId]?.[m.id] !== undefined) isRel = locationOverrides[locationId][m.id];
          if (isRel) relevant.add(m.id);
        });
        return relevant;
      };

      // ── Create workbook(s) ────────────────────────────────────────────
      const wbLsp = XLSX.utils.book_new();
      const wbInt = XLSX.utils.book_new();
      const supName = suppliers.find(s => s.id === selSupplier)?.name || "Supplier";

      // Summary sheet for LSP workbook
      const summaryWs: any = {};
      summaryWs["A1"] = makeCell(`${supName} — LSP KPI Scorecard ${year}`, ST.navyHd);
      summaryWs["A2"] = makeCell(`Exported: ${new Date().toLocaleDateString()}  |  Year: ${year}  |  Locations: ${locations?.length || 0}`, ST.monthHd);
      summaryWs["!ref"] = "A1:Z2";
      summaryWs["!cols"] = [{ wch: 60 }];
      XLSX.utils.book_append_sheet(wbLsp, summaryWs, "Summary");

      const summaryIntWs: any = {};
      summaryIntWs["A1"] = makeCell(`${supName} — Internal Ratings ${year}`, ST.navyHd);
      summaryIntWs["A2"] = makeCell(`Exported: ${new Date().toLocaleDateString()}  |  Year: ${year}  |  Locations: ${locations?.length || 0}`, ST.monthHd);
      summaryIntWs["!ref"] = "A1:Z2";
      summaryIntWs["!cols"] = [{ wch: 60 }];
      XLSX.utils.book_append_sheet(wbInt, summaryIntWs, "Summary");

      // ── One sheet per location ────────────────────────────────────────
      for (const loc of (locations || [])) {
        const locMonths = monthCols.map(mc => {
          const sub = subIndex[`${loc.id}|${mc.month}`];
          return {
            key: mc.key,
            label: mc.label,
            month: mc.month,
            year: mc.year,
            submissionId: sub?.id || null,
            status: sub?.status || "",
          };
        });

        // Build per-month response maps
        const responsesByMonth: Record<string, Record<string, { val: any; pts: number | null }>> = {};
        const catScoresByMonth: Record<string, Record<string, number>> = {};
        const overallByMonth: Record<string, number> = {};

        locMonths.forEach(mo => {
          if (!mo.submissionId) return;
          responsesByMonth[mo.key] = respIndex[mo.submissionId] || {};
          catScoresByMonth[mo.key] = catScoreIndex[mo.submissionId] || {};
          if (overallIndex[mo.submissionId] !== undefined) overallByMonth[mo.key] = overallIndex[mo.submissionId];
        });

        const relevantIds = getRelevantIds(loc.id);
        const countryName = loc.countries?.country_name || "";
        const sheetLabel = `${countryName.substring(0, 8)}_${loc.name.substring(0, 18)}`;

        if (exportType !== "internal") {
          buildLocationSheet(wbLsp, sheetLabel, loc.name, supName, countryName,
            locMonths, allMetrics || [], relevantIds,
            responsesByMonth, catScoresByMonth, overallByMonth,
            categories || [], "lsp");
        }
        if (exportType !== "lsp") {
          buildLocationSheet(wbInt, sheetLabel, loc.name, supName, countryName,
            locMonths, allMetrics || [], relevantIds,
            responsesByMonth, catScoresByMonth, overallByMonth,
            categories || [], "internal");
        }
      }

      // ── Write files ───────────────────────────────────────────────────
      setStatus("Writing files…");
      const safeSupName = supName.replace(/\s+/g,"_");

      if (exportType !== "internal") {
        XLSX.writeFile(wbLsp, `${safeSupName}_LSP_KPIs_${year}.xlsx`, { cellStyles: true });
      }
      if (exportType !== "lsp") {
        XLSX.writeFile(wbInt, `${safeSupName}_Internal_Ratings_${year}.xlsx`, { cellStyles: true });
      }

      setStatus("");
      setStatus(`✓ Done — ${locations?.length} location sheet${locations?.length !== 1 ? 's' : ''} exported.`);

    } catch (e: any) {
      setStatus("");
      setStatus(`❌ Export failed: ${e.message}`);
    }
    setExporting(false);
  };

  const sup = suppliers.find(s => s.id === selSupplier);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
      <style>{`
        .ex-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .ex-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media(max-width:600px){.ex-grid{grid-template-columns:1fr}}
        .ex-type-row{display:flex;gap:8px;flex-wrap:wrap}
        .ex-type-btn{flex:1;min-width:140px;height:44px;border-radius:8px;border:1.5px solid #E2E8F0;background:#fff;font-size:13px;font-weight:500;color:#475569;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s}
        .ex-type-btn:hover{border-color:#93C5FD;color:#2563EB;background:#EFF6FF}
        .ex-type-btn.active{border-color:#2563EB;background:#2563EB;color:#fff;font-weight:600}
        .ex-desc{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 16px;font-size:13px;color:#1D4ED8;line-height:1.6}
        .ex-btn{height:44px;padding:0 28px;background:#059669;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:10px}
        .ex-btn:hover{background:#047857}
        .ex-btn:disabled{background:#6EE7B7;cursor:not-allowed}
        .ex-status{font-size:13px;color:#059669;font-weight:500;display:flex;align-items:center;gap:8px}
        .ex-spinner{width:14px;height:14px;border:2px solid #BBF7D0;border-top-color:#059669;border-radius:50%;animation:spin 0.7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .ex-legend{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
        .ex-legend-item{display:flex;align-items:center;gap:8px;font-size:12px;color:#475569}
        .ex-legend-swatch{width:28px;height:16px;border-radius:3px;flex-shrink:0}
      `}</style>

      {/* Selector */}
      <div className="ex-card">
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F1B2D", marginBottom: 4 }}>Scorecard Export</div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>
          Exports one Excel file per type, with one tab per location. Months as columns, metrics as rows.
          Inactive metrics shown greyed out.
        </div>
        <div className="ex-grid">
          <div><div style={LBL}>Supplier</div>
            <select style={{ cssText: SEL } as any} value={selSupplier} onChange={e => setSelSupplier(e.target.value)}>
              <option value="">— Select —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Year</div>
            <select style={{ cssText: SEL } as any} value={year} onChange={e => setYear(e.target.value)}>
              {[2024, 2025, 2026].map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Export type */}
      <div className="ex-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F1B2D", marginBottom: 12 }}>Export Type</div>
        <div className="ex-type-row">
          {[
            { key: "both", label: "📊 Both files" },
            { key: "lsp", label: "📦 LSP KPIs only" },
            { key: "internal", label: "⭐ Internal Ratings only" },
          ].map(t => (
            <button key={t.key} className={`ex-type-btn ${exportType === t.key ? "active" : ""}`}
              onClick={() => setExportType(t.key as any)}>{t.label}</button>
          ))}
        </div>

        {/* Description */}
        <div className="ex-desc" style={{ marginTop: 16 }}>
          {exportType === "both" && <>Downloads <strong>two Excel files</strong>: one for LSP KPI data (numeric %, counts) and one for Internal Ratings (Likert 1–5). Each has one tab per location.</>}
          {exportType === "lsp" && <>Downloads <strong>one Excel file</strong> with LSP numeric KPI values (%, counts, zero-tolerance metrics). One tab per location. Months as columns.</>}
          {exportType === "internal" && <>Downloads <strong>one Excel file</strong> with internal Likert rating scores (1–5) and calculated points. One tab per location. Months as columns.</>}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>Layout legend:</div>
        <div className="ex-legend">
          <div className="ex-legend-item"><div className="ex-legend-swatch" style={{ background: "#DBEAFE" }}/>Active metric — has data</div>
          <div className="ex-legend-item"><div className="ex-legend-swatch" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}/>Inactive metric (greyed out)</div>
          <div className="ex-legend-item"><div className="ex-legend-swatch" style={{ background: "#059669" }}/>Score ≥ 80 (green)</div>
          <div className="ex-legend-item"><div className="ex-legend-swatch" style={{ background: "#D97706" }}/>Score 60–79 (amber)</div>
          <div className="ex-legend-item"><div className="ex-legend-swatch" style={{ background: "#DC2626" }}/>Score &lt; 60 (red)</div>
          <div className="ex-legend-item"><div className="ex-legend-swatch" style={{ background: "#E2E8F0" }}/>Category / overall score row</div>
        </div>
      </div>

      {/* Export button */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ex-btn" onClick={runExport} disabled={!selSupplier || exporting}>
          {exporting ? (
            <><div className="ex-spinner" />Exporting…</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Download Excel{exportType === "both" ? " Files" : " File"}
            </>
          )}
        </button>
        {status && (
          <div className="ex-status">
            {exporting && <div className="ex-spinner" />}
            {status}
          </div>
        )}
        {selSupplier && !exporting && (
          <div style={{ fontSize: 12.5, color: "#64748B" }}>
            {sup?.name} · {year}
          </div>
        )}
      </div>

      {/* Structure preview */}
      <div className="ex-card" style={{ background: "#F8FAFC" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Output structure</div>
        <div style={{ fontFamily: "monospace", fontSize: 11.5, color: "#334155", lineHeight: 1.8 }}>
          <div>📁 <strong>Supplier_LSP_KPIs_2026.xlsx</strong></div>
          <div style={{ marginLeft: 16 }}>├ Summary</div>
          <div style={{ marginLeft: 16 }}>├ Germany_Langenbach</div>
          <div style={{ marginLeft: 16 }}>├ Germany_Dorsten</div>
          <div style={{ marginLeft: 16 }}>└ Czechoslovakia_Prague</div>
          <div style={{ marginTop: 8 }}>📁 <strong>Supplier_Internal_Ratings_2026.xlsx</strong></div>
          <div style={{ marginLeft: 16 }}>├ Summary</div>
          <div style={{ marginLeft: 16 }}>├ Germany_Langenbach</div>
          <div style={{ marginLeft: 16 }}>└ …same locations</div>
          <div style={{ marginTop: 8, color: "#94A3B8" }}>Each sheet: rows = metrics (all 23, inactive greyed out), columns = months with data</div>
        </div>
      </div>
    </div>
  );
}


