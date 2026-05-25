// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase, FULL_MONTHS, SHORT_MONTHS } from "@/lib/supabase";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// LSP Excel Template Download + Upload
// Placed in Supplier App as an alternative to the manual 3-step form
// ─────────────────────────────────────────────────────────────────────────────

const SEL = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;width:100%;appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center`;
const INP = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;width:100%`;
const LBL = { fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: "0.02em", textTransform: "uppercase" as const, marginBottom: 5 };

export default function ExcelTemplate() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [form, setForm] = useState({ supplier_id: "", country_id: "", location_id: "", month: new Date().getMonth() + 1, year: new Date().getFullYear(), submitter: "" });
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState("");
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name,business_type").eq("status","active").order("name"),
      supabase.from("metrics").select("id,number,name,input_type,reported_by,max_points,applies_b2b,applies_b2c,category_id,categories(name)").eq("reported_by","lsp").order("number"),
    ]).then(([s, m]) => { setSuppliers(s.data || []); setMetrics(m.data || []); });
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
      supabase.from("locations").select("id,name").eq("country_id", form.country_id).eq("status","active").order("name")
        .then(({ data }) => setLocations(data || []));
      setForm(f => ({ ...f, location_id: "" }));
    }
  }, [form.country_id]);

  // ── Get relevant metrics for this supplier ──────────────────────────────
  const getRelevantMetrics = async () => {
    const sup = suppliers.find(s => s.id === form.supplier_id);
    let relevant = metrics.filter(m => {
      if (sup?.business_type === "B2B" && !m.applies_b2b) return false;
      if (sup?.business_type === "B2C" && !m.applies_b2c) return false;
      return true;
    });
    // Apply metric_relevance overrides
    const { data: relRows } = await supabase.from("metric_relevance")
      .select("metric_id,is_relevant")
      .eq("supplier_id", form.supplier_id);
    const relMap: Record<string, boolean> = {};
    (relRows || []).forEach(r => { relMap[r.metric_id] = r.is_relevant; });
    relevant = relevant.filter(m => relMap[m.id] !== false);
    return relevant;
  };

  // ── Get prior month values for carry-forward ────────────────────────────
  const getPriorValues = async () => {
    if (!form.location_id) return {};
    const pm = form.month === 1 ? 12 : form.month - 1;
    const py = form.month === 1 ? form.year - 1 : form.year;
    const { data: subs } = await supabase.from("submissions")
      .select("id").eq("location_id", form.location_id)
      .eq("reporting_month", pm).eq("reporting_year", py);
    if (!subs?.length) return {};
    const { data: resp } = await supabase.from("responses")
      .select("metric_id,value_numeric").eq("submission_id", subs[0].id);
    const map: Record<string, number> = {};
    (resp || []).forEach(r => { if (r.value_numeric !== null) map[r.metric_id] = r.value_numeric; });
    return map;
  };

  // ── Download template ───────────────────────────────────────────────────
  const downloadTemplate = async () => {
    if (!form.supplier_id || !form.location_id) return;
    setDownloading(true);
    try {
      const relevant = await getRelevantMetrics();
      const priorValues = await getPriorValues();
      const sup = suppliers.find(s => s.id === form.supplier_id);
      const loc = locations.find(l => l.id === form.location_id);
      const country = countries.find(c => c.id === form.country_id);
      const periodLabel = `${FULL_MONTHS[form.month - 1]} ${form.year}`;
      const priorLabel = form.month === 1 ? `Dec ${form.year - 1}` : `${FULL_MONTHS[form.month - 2]} ${form.year}`;

      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Instructions ──────────────────────────────────────────
      const instrData = [
        ["LSP SCORECARD — DATA SUBMISSION TEMPLATE"],
        [""],
        ["Supplier:", sup?.name || ""],
        ["Location:", loc?.name || ""],
        ["Country:", country?.country_name || ""],
        ["Period:", periodLabel],
        [""],
        ["INSTRUCTIONS"],
        ["1. Fill in the VALUE column (column D) for each metric"],
        ["2. Percentages: enter as numbers, e.g. 98.5 (not 98.5%)"],
        ["3. Counts: enter whole numbers only"],
        ["4. Do NOT change metric names, numbers or any other columns"],
        ["5. Do NOT add or remove rows"],
        ["6. Save the file and upload it back via the LSP Scorecard platform"],
        [""],
        ["COLOUR CODING"],
        ["Yellow cells = your entry required"],
        ["Blue cells = carry-forward from last month (pre-filled, can be changed)"],
        ["Grey cells = for reference only, do not edit"],
      ];
      const instrWs = XLSX.utils.aoa_to_sheet(instrData);
      instrWs["!cols"] = [{ wch: 20 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

      // ── Sheet 2: Data entry ────────────────────────────────────────────
      const headers = ["#", "Category", "Metric Name", "Value", `Prior Month (${priorLabel})`, "Unit", "Max Points", "Notes"];
      const rows: any[][] = [headers];

      relevant.forEach(m => {
        const prior = priorValues[m.id] ?? "";
        const unit = m.input_type === "percent" ? "%" : m.input_type === "count" ? "count" : "";
        rows.push([
          m.number,
          m.categories?.name || "",
          m.name,
          prior !== "" ? prior : "",  // pre-fill with prior if available
          prior !== "" ? prior : "",
          unit,
          m.max_points,
          m.input_type === "percent" ? "Enter 0-100" : "Enter whole number",
        ]);
      });

      const dataWs = XLSX.utils.aoa_to_sheet(rows);

      // Column widths
      dataWs["!cols"] = [
        { wch: 5 },   // #
        { wch: 30 },  // Category
        { wch: 45 },  // Metric Name
        { wch: 14 },  // Value
        { wch: 18 },  // Prior
        { wch: 8 },   // Unit
        { wch: 12 },  // Max pts
        { wch: 25 },  // Notes
      ];

      // Style header row
      const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "0F1B2D" } }, alignment: { horizontal: "center" } };
      headers.forEach((_, i) => {
        const cell = XLSX.utils.encode_cell({ r: 0, c: i });
        if (dataWs[cell]) dataWs[cell].s = headerStyle;
      });

      // Style Value column (yellow = entry required)
      const valueStyle = { fill: { fgColor: { rgb: "FFFDE7" } }, alignment: { horizontal: "center" } };
      const priorStyle = { fill: { fgColor: { rgb: "E3F2FD" } }, alignment: { horizontal: "center" }, font: { color: { rgb: "1565C0" } } };
      const refStyle = { fill: { fgColor: { rgb: "F5F5F5" } }, font: { color: { rgb: "9E9E9E" } } };

      for (let r = 1; r < rows.length; r++) {
        // Value cell (col D = index 3) - yellow
        const vCell = XLSX.utils.encode_cell({ r, c: 3 });
        if (dataWs[vCell]) dataWs[vCell].s = valueStyle;
        // Prior cell (col E = index 4) - blue
        const pCell = XLSX.utils.encode_cell({ r, c: 4 });
        if (dataWs[pCell]) dataWs[pCell].s = priorStyle;
        // Other cells - grey
        [0, 1, 2, 5, 6, 7].forEach(c => {
          const cell = XLSX.utils.encode_cell({ r, c });
          if (dataWs[cell]) dataWs[cell].s = refStyle;
        });
      }

      XLSX.utils.book_append_sheet(wb, dataWs, "Data Entry");

      // ── Sheet 3: Metadata (hidden — used by upload parser) ────────────
      const metaRows = [
        ["METADATA — DO NOT EDIT"],
        ["supplier_id", form.supplier_id],
        ["location_id", form.location_id],
        ["country_id", form.country_id],
        ["reporting_month", form.month],
        ["reporting_year", form.year],
        ["template_version", "v1"],
        ["generated_at", new Date().toISOString()],
        ["metric_ids", relevant.map(m => m.id).join(",")],
        ["metric_numbers", relevant.map(m => m.number).join(",")],
      ];
      const metaWs = XLSX.utils.aoa_to_sheet(metaRows);
      metaWs["!cols"] = [{ wch: 20 }, { wch: 80 }];
      XLSX.utils.book_append_sheet(wb, metaWs, "_meta");

      const filename = `LSP_Scorecard_${sup?.name?.replace(/\s+/g, "_")}_${loc?.name?.replace(/\s+/g, "_")}_${FULL_MONTHS[form.month - 1]}_${form.year}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e: any) {
      console.error("Download error:", e);
    }
    setDownloading(false);
  };

  // ── Parse and upload template ───────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploadResult(null);
    setPreviewRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });

      // Read metadata sheet
      const metaWs = wb.Sheets["_meta"];
      if (!metaWs) { setUploadError("Invalid template — metadata sheet missing. Please download a fresh template."); return; }
      const metaData = XLSX.utils.sheet_to_json(metaWs, { header: 1 }) as any[][];
      const meta: Record<string, string> = {};
      metaData.slice(1).forEach(row => { if (row[0] && row[1]) meta[row[0]] = String(row[1]); });

      const supplierId = meta["supplier_id"];
      const locationId = meta["location_id"];
      const countryId = meta["country_id"];
      const month = Number(meta["reporting_month"]);
      const year = Number(meta["reporting_year"]);
      const metricIds = meta["metric_ids"]?.split(",") || [];
      const metricNumbers = meta["metric_numbers"]?.split(",").map(Number) || [];

      if (!supplierId || !locationId || !month || !year) {
        setUploadError("Template metadata is incomplete or corrupted. Download a fresh template.");
        return;
      }

      // Read data sheet
      const dataWs = wb.Sheets["Data Entry"];
      if (!dataWs) { setUploadError("Data Entry sheet not found."); return; }
      const rows = XLSX.utils.sheet_to_json(dataWs, { header: 1 }) as any[][];

      // Parse rows (skip header row 0)
      const parsed: { metric_id: string; metric_number: number; metric_name: string; value: number | null }[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const metricNumber = Number(row[0]);
        const metricName = String(row[2] || "");
        const valueRaw = row[3];
        const idx = metricNumbers.indexOf(metricNumber);
        if (idx === -1) continue;
        const metricId = metricIds[idx];
        const value = valueRaw !== null && valueRaw !== undefined && valueRaw !== "" ? Number(valueRaw) : null;
        if (!isNaN(metricNumber) && metricId) {
          parsed.push({ metric_id: metricId, metric_number: metricNumber, metric_name: metricName, value });
        }
      }

      const filled = parsed.filter(p => p.value !== null);
      if (!filled.length) { setUploadError("No values found in the template. Fill in the Value column and try again."); return; }

      setPreviewRows(parsed);
      setUploadResult({ supplierId, locationId, countryId, month, year, parsed, filled });
    } catch (e: any) {
      setUploadError(`Failed to read file: ${e.message}`);
    }
    // Reset input so same file can be re-uploaded
    if (fileRef.current) fileRef.current.value = "";
  };

  const confirmUpload = async () => {
    if (!uploadResult) return;
    setUploading(true);
    try {
      const { supplierId, locationId, countryId, month, year, filled } = uploadResult;

      // Get current submission bands for point calculation
      const metricIds = filled.map(f => f.metric_id);
      const { data: bands } = await supabase.from("scoring_bands").select("*")
        .in("metric_id", metricIds).order("band_order");
      const { data: allMetrics } = await supabase.from("metrics")
        .select("id,number,max_points,input_type").in("id", metricIds);

      const calcPoints = (metricId: string, value: number): number | null => {
        const metricBands = (bands || []).filter(b => b.metric_id === metricId);
        if (!metricBands.length) return null;
        const sorted = [...metricBands].sort((a, b) => a.band_order - b.band_order);
        for (const band of sorted) {
          if (value >= Number(band.threshold_min) && value <= Number(band.threshold_max)) return Number(band.points);
        }
        return 0;
      };

      // Upsert submission
      const { data: existing } = await supabase.from("submissions").select("id")
        .eq("location_id", locationId).eq("reporting_month", month).eq("reporting_year", year);

      let subId: string;
      if (existing?.length) {
        subId = existing[0].id;
        // Delete existing LSP responses only
        const { data: existingResp } = await supabase.from("responses")
          .select("id,metric_id").eq("submission_id", subId);
        const lspMetricIds = new Set(metricIds);
        const toDelete = (existingResp || []).filter(r => lspMetricIds.has(r.metric_id)).map(r => r.id);
        if (toDelete.length) await supabase.from("responses").delete().in("id", toDelete);
        await supabase.from("submissions").update({
          submitted_by: form.submitter || "Excel upload",
          submitted_at: new Date().toISOString(),
          status: "submitted",
        }).eq("id", subId);
      } else {
        const { data: newSub, error } = await supabase.from("submissions").insert({
          location_id: locationId,
          supplier_id: supplierId,
          country_id: countryId,
          reporting_month: month,
          reporting_year: year,
          submitted_by: form.submitter || "Excel upload",
          submitted_at: new Date().toISOString(),
          status: "submitted",
        }).select("id");
        if (error) throw error;
        subId = newSub![0].id;
      }

      // Insert responses
      const { error: respErr } = await supabase.from("responses").insert(
        filled.map(f => ({
          submission_id: subId,
          metric_id: f.metric_id,
          value_numeric: f.value,
          points_earned: calcPoints(f.metric_id, f.value!),
          entered_by: form.submitter || "Excel upload",
        }))
      );
      if (respErr) throw respErr;

      setUploadResult({ ...uploadResult, success: true, subId, filledCount: filled.length });
      setPreviewRows([]);
    } catch (e: any) {
      setUploadError(`Upload failed: ${e.message}`);
    }
    setUploading(false);
  };

  const canDownload = form.supplier_id && form.location_id;
  const sup = suppliers.find(s => s.id === form.supplier_id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <style>{`
        .et-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .et-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media(max-width:640px){.et-grid{grid-template-columns:1fr}}
        .et-section-title{font-size:15px;font-weight:700;color:#0F1B2D;margin:0 0 4px}
        .et-section-sub{font-size:13px;color:#64748B;margin:0 0 20px}
        .et-step{display:flex;align-items:flex-start;gap:14px}
        .et-step-num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
        .et-btn-dl{height:42px;padding:0 24px;background:#2563EB;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:8px}
        .et-btn-dl:hover{background:#1D4ED8}
        .et-btn-dl:disabled{background:#93C5FD;cursor:not-allowed}
        .et-upload-zone{border:2px dashed #CBD5E1;border-radius:12px;padding:32px;text-align:center;cursor:pointer;transition:all 0.2s;background:#FAFBFC}
        .et-upload-zone:hover{border-color:#2563EB;background:#EFF6FF}
        .et-upload-title{font-size:15px;font-weight:600;color:#0F1B2D;margin-bottom:6px}
        .et-upload-sub{font-size:13px;color:#64748B}
        .et-btn-browse{height:36px;padding:0 16px;background:#fff;color:#2563EB;border:1.5px solid #BFDBFE;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;margin-top:12px}
        .et-preview-table{width:100%;border-collapse:collapse}
        .et-preview-table thead th{background:#F8FAFC;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:left}
        .et-preview-table thead th:last-child{text-align:right}
        .et-preview-table tbody tr{border-bottom:1px solid #F8FAFC}
        .et-preview-table tbody tr:last-child{border-bottom:none}
        .et-preview-table td{padding:9px 14px;font-size:13px;color:#334155}
        .et-preview-table td.num{font-weight:600;color:#0F1B2D}
        .et-preview-table td.val{text-align:right;font-weight:700;color:#2563EB}
        .et-preview-table td.empty{text-align:right;color:#CBD5E1;font-style:italic}
        .et-error{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#B91C1C;font-weight:500}
        .et-success{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:24px;text-align:center}
        .et-btn-confirm{height:42px;padding:0 24px;background:#059669;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .et-btn-confirm:hover{background:#047857}
        .et-btn-confirm:disabled{background:#6EE7B7;cursor:not-allowed}
        .et-btn-cancel{height:42px;padding:0 18px;background:#fff;color:#475569;border:1.5px solid #E2E8F0;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .et-divider{border:none;border-top:2px dashed #E2E8F0;margin:8px 0}
      `}</style>

      {/* ── STEP 1: Select location & period ─────────────────────────── */}
      <div className="et-card">
        <div className="et-section-title">Select Supplier, Location & Period</div>
        <div className="et-section-sub">Required for both download and upload</div>
        <div className="et-grid">
          <div><div style={LBL}>Supplier</div>
            <select style={{cssText:SEL} as any} value={form.supplier_id} onChange={e => setForm({...form, supplier_id:e.target.value, country_id:"", location_id:""})}>
              <option value="">— Select —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Country</div>
            <select style={{cssText:SEL} as any} value={form.country_id} disabled={!form.supplier_id} onChange={e => setForm({...form, country_id:e.target.value, location_id:""})}>
              <option value="">— Select —</option>{countries.map(c=><option key={c.id} value={c.id}>{c.country_name}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Location</div>
            <select style={{cssText:SEL} as any} value={form.location_id} disabled={!form.country_id} onChange={e => setForm({...form, location_id:e.target.value})}>
              <option value="">— Select —</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Month</div>
            <select style={{cssText:SEL} as any} value={String(form.month)} onChange={e => setForm({...form, month:Number(e.target.value)})}>
              {FULL_MONTHS.map((m,i)=><option key={i} value={String(i+1)}>{m}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Year</div>
            <select style={{cssText:SEL} as any} value={String(form.year)} onChange={e => setForm({...form, year:Number(e.target.value)})}>
              {[2024,2025,2026].map(y=><option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
          <div><div style={LBL}>Submitted by</div>
            <input style={{cssText:INP} as any} value={form.submitter} onChange={e => setForm({...form, submitter:e.target.value})} placeholder="Your name" />
          </div>
        </div>
      </div>

      <hr className="et-divider" />

      {/* ── STEP 2: Download template ─────────────────────────────────── */}
      <div className="et-card">
        <div className="et-section-title">Step 1 — Download Template</div>
        <div className="et-section-sub">
          Downloads a pre-filled Excel file with your metrics and last month's figures. Fill in the Value column and upload below.
        </div>
        {canDownload ? (
          <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
            <button className="et-btn-dl" onClick={downloadTemplate} disabled={downloading}>
              {downloading ? "Generating…" : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Download Template
                </>
              )}
            </button>
            <div style={{fontSize:13,color:"#64748B"}}>
              {sup?.name} · {locations.find(l=>l.id===form.location_id)?.name} · {FULL_MONTHS[form.month-1]} {form.year}
            </div>
          </div>
        ) : (
          <div style={{fontSize:13,color:"#94A3B8"}}>Select supplier, location and period above to download template.</div>
        )}
      </div>

      {/* ── STEP 3: Upload filled template ───────────────────────────── */}
      <div className="et-card">
        <div className="et-section-title">Step 2 — Upload Filled Template</div>
        <div className="et-section-sub">Upload your completed Excel file. Values will be parsed and saved automatically.</div>

        {uploadResult?.success ? (
          <div className="et-success">
            <div style={{fontSize:32,marginBottom:12}}>✅</div>
            <div style={{fontSize:17,fontWeight:700,color:"#0F1B2D",marginBottom:6}}>Upload successful</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:16}}>{uploadResult.filledCount} metric values saved for {FULL_MONTHS[uploadResult.month-1]} {uploadResult.year}</div>
            <button className="et-btn-cancel" onClick={() => { setUploadResult(null); setPreviewRows([]); }}>Upload Another</button>
          </div>
        ) : previewRows.length > 0 ? (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#1D4ED8"}}>
              <strong>{previewRows.filter(r=>r.value!==null).length} of {previewRows.length} metrics filled.</strong> Review below before confirming.
            </div>
            <div style={{overflow:"auto",maxHeight:300,border:"1px solid #E2E8F0",borderRadius:10}}>
              <table className="et-preview-table">
                <thead><tr><th>#</th><th>Metric</th><th>Value</th></tr></thead>
                <tbody>
                  {previewRows.map(r=>(
                    <tr key={r.metric_id}>
                      <td className="num">{r.metric_number}</td>
                      <td>{r.metric_name}</td>
                      {r.value !== null
                        ? <td className="val">{r.value}</td>
                        : <td className="empty">not filled</td>
                      }
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {uploadError && <div className="et-error">⚠ {uploadError}</div>}
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button className="et-btn-confirm" onClick={confirmUpload} disabled={uploading}>
                {uploading ? "Saving…" : `✓ Confirm & Submit ${previewRows.filter(r=>r.value!==null).length} values`}
              </button>
              <button className="et-btn-cancel" onClick={() => { setPreviewRows([]); setUploadResult(null); setUploadError(""); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {uploadError && <div className="et-error" style={{marginBottom:14}}>⚠ {uploadError}</div>}
            <div className="et-upload-zone" onClick={() => fileRef.current?.click()}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{margin:"0 auto 10px"}}><path d="M16 4v16M10 14l6-6 6 6M6 24h20" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <div className="et-upload-title">Drop your Excel file here</div>
              <div className="et-upload-sub">or tap to browse — .xlsx files only</div>
              <button className="et-btn-browse" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>Browse Files</button>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{display:"none"}} onChange={handleFileChange} />
          </>
        )}
      </div>
    </div>
  );
}
