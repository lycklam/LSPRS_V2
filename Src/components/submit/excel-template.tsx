// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase, FULL_MONTHS } from "@/lib/supabase";
import * as XLSX from "xlsx/dist/xlsx.full.min.js";

const SEL = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;width:100%;appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center`;
const INP = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;width:100%`;
const LBL = { fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: "0.02em", textTransform: "uppercase" as const, marginBottom: 5 };

export default function ExcelTemplate() {


  // Shared state
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [lspMetrics, setLspMetrics] = useState<any[]>([]);

  const [form, setForm] = useState({
    supplier_id: "", country_id: "", location_id: "",
    month: new Date().getMonth() + 1, year: new Date().getFullYear(),
    submitter: ""
  });

  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState("");
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name,business_type").eq("status", "active").order("name"),
      supabase.from("metrics").select("id,number,name,input_type,reported_by,max_points,applies_b2b,applies_b2c,categories(name)").eq("reported_by", "lsp").order("number"),
    ]).then(([s, lm]) => {
      setSuppliers(s.data || []);
      setLspMetrics(lm.data || []);
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

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getRelevantLspMetrics = async () => {
    const sup = suppliers.find(s => s.id === form.supplier_id);
    let relevant = lspMetrics.filter(m => {
      if (sup?.business_type === "B2B" && !m.applies_b2b) return false;
      if (sup?.business_type === "B2C" && !m.applies_b2c) return false;
      return true;
    });
    const { data: relRows } = await supabase.from("metric_relevance")
      .select("metric_id,is_relevant").eq("supplier_id", form.supplier_id);
    const relMap: Record<string, boolean> = {};
    (relRows || []).forEach(r => { relMap[r.metric_id] = r.is_relevant; });
    return relevant.filter(m => relMap[m.id] !== false);
  };

  const getPriorNumericValues = async () => {
    if (!form.location_id) return {};
    const pm = form.month === 1 ? 12 : form.month - 1;
    const py = form.month === 1 ? form.year - 1 : form.year;
    const { data: subs } = await supabase.from("submissions").select("id")
      .eq("location_id", form.location_id).eq("reporting_month", pm).eq("reporting_year", py);
    if (!subs?.length) return {};
    const { data: resp } = await supabase.from("responses").select("metric_id,value_numeric").eq("submission_id", subs[0].id);
    const map: Record<string, number> = {};
    (resp || []).forEach(r => { if (r.value_numeric !== null) map[r.metric_id] = r.value_numeric; });
    return map;
  };

  // ── DOWNLOAD: LSP Template ───────────────────────────────────────────────────
  const downloadLspTemplate = async () => {
    if (!form.supplier_id || !form.location_id) return;
    setDownloading(true);
    try {
      const relevant = await getRelevantLspMetrics();
      const priorValues = await getPriorNumericValues();
      const sup = suppliers.find(s => s.id === form.supplier_id);
      const loc = locations.find(l => l.id === form.location_id);
      const country = countries.find(c => c.id === form.country_id);
      const periodLabel = `${FULL_MONTHS[form.month - 1]} ${form.year}`;
      const priorLabel = form.month === 1 ? `Dec ${form.year - 1}` : `${FULL_MONTHS[form.month - 2]} ${form.year}`;

      const wb = XLSX.utils.book_new();

      // Sheet 1: Instructions
      const instrData = [
        ["LSP SCORECARD — DATA SUBMISSION TEMPLATE"],
        [""],
        ["Supplier:", sup?.name || ""],
        ["Location:", loc?.name || ""],
        ["Country:", country?.country_name || ""],
        ["Period:", periodLabel],
        [""],
        ["INSTRUCTIONS"],
        ["1. Fill in the VALUE column (column C) for each metric"],
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

      // Sheet 2: Data Entry — columns: #, Category, Metric Name, Value, Prior Month, Unit
      // Removed: Max Points, Notes (not relevant for supplier)
      const headers = ["#", "Category", "Metric Name", "Value", `Prior Month (${priorLabel})`, "Unit"];
      const rows: any[][] = [headers];

      relevant.forEach(m => {
        const prior = priorValues[m.id] ?? "";
        const unit = m.input_type === "percent" ? "%" : m.input_type === "count" ? "count" : "";
        rows.push([
          m.number,
          m.categories?.name || "",
          m.name,
          prior !== "" ? prior : "",   // pre-fill Value with prior
          prior !== "" ? prior : "",   // Prior Month col
          unit,
        ]);
      });

      const dataWs = XLSX.utils.aoa_to_sheet(rows);
      dataWs["!cols"] = [
        { wch: 5 },   // #
        { wch: 32 },  // Category
        { wch: 48 },  // Metric Name
        { wch: 14 },  // Value ← yellow
        { wch: 18 },  // Prior Month ← blue
        { wch: 8 },   // Unit
      ];

      // Styles
      const hdStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "0F1B2D" } }, alignment: { horizontal: "center" } };
      const valStyle = { fill: { fgColor: { rgb: "FFFDE7" } }, alignment: { horizontal: "center" } };
      const priorStyle = { fill: { fgColor: { rgb: "E3F2FD" } }, alignment: { horizontal: "center" }, font: { color: { rgb: "1565C0" } } };
      const refStyle = { fill: { fgColor: { rgb: "F5F5F5" } }, font: { color: { rgb: "9E9E9E" } } };

      headers.forEach((_, i) => {
        const c = XLSX.utils.encode_cell({ r: 0, c: i });
        if (dataWs[c]) dataWs[c].s = hdStyle;
      });
      for (let r = 1; r < rows.length; r++) {
        const vCell = XLSX.utils.encode_cell({ r, c: 3 });
        if (dataWs[vCell]) dataWs[vCell].s = valStyle;
        const pCell = XLSX.utils.encode_cell({ r, c: 4 });
        if (dataWs[pCell]) dataWs[pCell].s = priorStyle;
        [0, 1, 2, 5].forEach(c => {
          const cell = XLSX.utils.encode_cell({ r, c });
          if (dataWs[cell]) dataWs[cell].s = refStyle;
        });
      }
      XLSX.utils.book_append_sheet(wb, dataWs, "Data Entry");

      // Sheet 3: Metadata
      const metaWs = XLSX.utils.aoa_to_sheet([
        ["METADATA — DO NOT EDIT"],
        ["template_type", "lsp"],
        ["supplier_id", form.supplier_id],
        ["location_id", form.location_id],
        ["country_id", form.country_id],
        ["reporting_month", form.month],
        ["reporting_year", form.year],
        ["generated_at", new Date().toISOString()],
        ["metric_ids", relevant.map(m => m.id).join(",")],
        ["metric_numbers", relevant.map(m => m.number).join(",")],
      ]);
      metaWs["!cols"] = [{ wch: 20 }, { wch: 80 }];
      XLSX.utils.book_append_sheet(wb, metaWs, "_meta");

      const filename = `LSP_KPI_${sup?.name?.replace(/\s+/g, "_")}_${loc?.name?.replace(/\s+/g, "_")}_${FULL_MONTHS[form.month - 1]}_${form.year}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e: any) { console.error("Download error:", e); }
    setDownloading(false);
  };

  // ── UPLOAD: Parse either template type ──────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(""); setUploadResult(null); setPreviewRows([]);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const metaWs = wb.Sheets["_meta"];
      if (!metaWs) { setUploadError("Invalid template — metadata sheet missing. Download a fresh template."); return; }
      const metaData = XLSX.utils.sheet_to_json(metaWs, { header: 1 }) as any[][];
      const meta: Record<string, string> = {};
      metaData.slice(1).forEach(row => { if (row[0] && row[1] !== undefined) meta[row[0]] = String(row[1]); });

      const tType = meta["template_type"] || "lsp";
      const supplierId = meta["supplier_id"];
      const locationId = meta["location_id"];
      const countryId = meta["country_id"];
      const month = Number(meta["reporting_month"]);
      const year = Number(meta["reporting_year"]);
      const reviewer = meta["reviewer"] || form.submitter || "Excel upload";
      const metricIds = meta["metric_ids"]?.split(",") || [];
      const metricNumbers = meta["metric_numbers"]?.split(",").map(Number) || [];

      if (!supplierId || !locationId || !month || !year) {
        setUploadError("Template metadata incomplete. Download a fresh template."); return;
      }

      const dataWs = wb.Sheets["Data Entry"];
      if (!dataWs) { setUploadError("Data Entry sheet not found."); return; }
      const rows = XLSX.utils.sheet_to_json(dataWs, { header: 1 }) as any[][];
      const parsed: any[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const metricNumber = Number(row[0]);
        const metricName = String(row[2] || "");
        const valueRaw = row[3];
        const idx = metricNumbers.indexOf(metricNumber);
        if (idx === -1 || isNaN(metricNumber)) continue;
        const value = valueRaw !== null && valueRaw !== undefined && valueRaw !== "" ? Number(valueRaw) : null;
        parsed.push({ metric_id: metricIds[idx], metric_number: metricNumber, metric_name: metricName, value });
      }
      const filled = parsed.filter(p => p.value !== null);
      if (!filled.length) { setUploadError("No values found. Fill in the Value column and try again."); return; }
      setPreviewRows(parsed);
      setUploadResult({ tType: "lsp", supplierId, locationId, countryId, month, year, reviewer, parsed, filled });
    } catch (e: any) { setUploadError(`Failed to read file: ${e.message}`); }
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── SAVE: Either template type ───────────────────────────────────────────────
  const confirmUpload = async () => {
    if (!uploadResult) return;
    setUploading(true);
    try {
      const { tType, supplierId, locationId, countryId, month, year, reviewer, filled } = uploadResult;

      // Upsert submission
      const { data: existing } = await supabase.from("submissions").select("id")
        .eq("location_id", locationId).eq("reporting_month", month).eq("reporting_year", year);

      let subId: string;
      if (existing?.length) {
        subId = existing[0].id;
        if (tType === "lsp") {
          // Delete only LSP responses, preserve internal Likert
          const lspMetricIds = new Set(filled.map(f => f.metric_id));
          const { data: existingResp } = await supabase.from("responses").select("id,metric_id").eq("submission_id", subId);
          const toDelete = (existingResp || []).filter(r => lspMetricIds.has(r.metric_id)).map(r => r.id);
          if (toDelete.length) await supabase.from("responses").delete().in("id", toDelete);
          await supabase.from("submissions").update({ submitted_by: reviewer, submitted_at: new Date().toISOString(), status: "submitted" }).eq("id", subId);
        } else {
          // Delete only internal (Likert) responses, preserve LSP numeric
          const intMetricIds = new Set(filled.map(f => f.metric_id));
          const { data: existingResp } = await supabase.from("responses").select("id,metric_id").eq("submission_id", subId);
          const toDelete = (existingResp || []).filter(r => intMetricIds.has(r.metric_id)).map(r => r.id);
          if (toDelete.length) await supabase.from("responses").delete().in("id", toDelete);
          await supabase.from("submissions").update({ reviewed_by: reviewer, reviewed_at: new Date().toISOString() }).eq("id", subId);
        }
      } else {
        const payload: any = {
          location_id: locationId, supplier_id: supplierId, country_id: countryId,
          reporting_month: month, reporting_year: year, status: "submitted",
          submitted_by: reviewer, submitted_at: new Date().toISOString(),
        };
        const { data: newSub, error } = await supabase.from("submissions").insert(payload).select("id");
        if (error) throw error;
        subId = newSub![0].id;
      }

      const metricIds = filled.map(f => f.metric_id);
      const { data: bands } = await supabase.from("scoring_bands").select("*").in("metric_id", metricIds).order("band_order");
      const calcPoints = (metricId: string, value: number) => {
        const mb = (bands || []).filter(b => b.metric_id === metricId).sort((a, b) => a.band_order - b.band_order);
        for (const band of mb) { if (value >= Number(band.threshold_min) && value <= Number(band.threshold_max)) return Number(band.points); }
        return 0;
      };
      const { error } = await supabase.from("responses").insert(
        filled.map(f => ({ submission_id: subId, metric_id: f.metric_id, value_numeric: f.value, points_earned: calcPoints(f.metric_id, f.value), entered_by: reviewer }))
      );
      if (error) throw error;

      setUploadResult({ ...uploadResult, success: true, subId, filledCount: filled.length });
      setPreviewRows([]);
    } catch (e: any) { setUploadError(`Upload failed: ${e.message}`); }
    setUploading(false);
  };

  const canDownload = form.supplier_id && form.location_id;
  const sup = suppliers.find(s => s.id === form.supplier_id);
  const loc = locations.find(l => l.id === form.location_id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <style>{`
        .et-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .et-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media(max-width:640px){.et-grid{grid-template-columns:1fr}}
        .et-title{font-size:15px;font-weight:700;color:#0F1B2D;margin:0 0 4px}
        .et-sub{font-size:13px;color:#64748B;margin:0 0 20px}
        .et-btn-dl{height:42px;padding:0 24px;background:#2563EB;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:8px}
        .et-btn-dl:hover{background:#1D4ED8}
        .et-btn-dl.green{background:#059669}
        .et-btn-dl.green:hover{background:#047857}
        .et-btn-dl:disabled{opacity:0.5;cursor:not-allowed}
        .et-upload-zone{border:2px dashed #CBD5E1;border-radius:12px;padding:32px;text-align:center;cursor:pointer;transition:all 0.2s;background:#FAFBFC}
        .et-upload-zone:hover{border-color:#2563EB;background:#EFF6FF}
        .et-preview-table{width:100%;border-collapse:collapse}
        .et-preview-table thead th{background:#F8FAFC;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:left}
        .et-preview-table thead th.r{text-align:right}
        .et-preview-table tbody tr{border-bottom:1px solid #F8FAFC}
        .et-preview-table td{padding:9px 14px;font-size:13px;color:#334155}
        .et-preview-table td.num{font-weight:600;color:#0F1B2D;width:32px}
        .et-preview-table td.val{text-align:right;font-weight:700;color:#2563EB}
        .et-preview-table td.empty{text-align:right;color:#CBD5E1;font-style:italic}
        .et-error{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#B91C1C;font-weight:500}
        .et-success{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:28px;text-align:center}
        .et-btn-confirm{height:42px;padding:0 24px;background:#059669;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .et-btn-confirm:hover{background:#047857}
        .et-btn-confirm:disabled{background:#6EE7B7;cursor:not-allowed}
        .et-btn-cancel{height:42px;padding:0 18px;background:#fff;color:#475569;border:1.5px solid #E2E8F0;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .et-info-box{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 16px;font-size:13px;color:#1D4ED8;margin-bottom:14px}
        .et-divider{border:none;border-top:2px dashed #E2E8F0;margin:4px 0}
      `}</style>

      {/* ── Selector ───────────────────────────────────────────────────── */}
      <div className="et-card">
        <div className="et-title">Select Supplier, Location & Period</div>
        <div className="et-sub">Required for both download and upload</div>
        <div className="et-grid">
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
          <div><div style={LBL}>Submitted by</div>
            <input style={{ cssText: INP } as any} value={form.submitter} onChange={e => setForm({ ...form, submitter: e.target.value })} placeholder="Your name" />
          </div>
        </div>
      </div>

      <hr className="et-divider" />

      {/* ── Download ───────────────────────────────────────────────────── */}
      <div className="et-card">
        <div className="et-title">Step 1 — Download LSP Template</div>
        <div className="et-sub">Pre-filled with last month's figures. Fill in the yellow Value column (column D) and upload below.</div>
        {canDownload ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button
              className="et-btn-dl"
              onClick={downloadLspTemplate}
              disabled={downloading}
            >
              {downloading ? "Generating…" : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Download LSP Template
                </>
              )}
            </button>
            <div style={{ fontSize: 13, color: "#64748B" }}>
              {sup?.name} · {loc?.name} · {FULL_MONTHS[form.month - 1]} {form.year}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#94A3B8" }}>Select supplier, location and period above.</div>
        )}
      </div>

      {/* ── Upload ─────────────────────────────────────────────────────── */}
      <div className="et-card">
        <div className="et-title">Step 2 — Upload Filled Template</div>
        <div className="et-sub">Upload your completed LSP KPI template. Values are parsed and saved automatically.</div>

        {uploadResult?.success ? (
          <div className="et-success">
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0F1B2D", marginBottom: 6 }}>Upload successful</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
              {uploadResult.filledCount} KPI values saved for {FULL_MONTHS[uploadResult.month - 1]} {uploadResult.year}
            </div>
            <button className="et-btn-cancel" onClick={() => { setUploadResult(null); setPreviewRows([]); }}>Upload Another</button>
          </div>
        ) : previewRows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="et-info-box">
              <strong>{previewRows.filter(r => r.value !== null).length} of {previewRows.length} metrics filled</strong>
              " — KPI values".
              Review below then confirm.
            </div>
            <div style={{ overflow: "auto", maxHeight: 300, border: "1px solid #E2E8F0", borderRadius: 10 }}>
              <table className="et-preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Metric</th>
                    <th className="r">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(r => (
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="et-btn-confirm" onClick={confirmUpload} disabled={uploading}>
                {uploading ? "Saving…" : `✓ Confirm & Save ${previewRows.filter(r => r.value !== null).length} values`}
              </button>
              <button className="et-btn-cancel" onClick={() => { setPreviewRows([]); setUploadResult(null); setUploadError(""); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {uploadError && <div className="et-error" style={{ marginBottom: 14 }}>⚠ {uploadError}</div>}
            <div className="et-upload-zone" onClick={() => fileRef.current?.click()}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin: "0 auto 10px" }}>
                <path d="M16 4v16M10 14l6-6 6 6M6 24h20" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#0F1B2D", marginBottom: 6 }}>Drop your Excel file here</div>
              <div style={{ fontSize: 13, color: "#64748B" }}>or tap to browse — .xlsx files only</div>
              <button className="et-btn-cancel" style={{ height: 36, marginTop: 12, padding: "0 16px", fontSize: 13 }}
                onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>Browse Files</button>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleFileChange} />
          </>
        )}
      </div>
    </div>
  );
}
