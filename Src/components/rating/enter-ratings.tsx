import { useState, useEffect, useRef } from "react";
import { supabase, FULL_MONTHS, CAT_COLORS } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx/dist/xlsx.full.min.js";

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

  // Excel upload/download state
  const [xlDownloading, setXlDownloading] = useState(false);
  const [xlUploading, setXlUploading] = useState(false);
  const [xlPreview, setXlPreview] = useState<any[]>([]);
  const [xlResult, setXlResult] = useState<any>(null);
  const [xlError, setXlError] = useState("");
  const xlFileRef = useRef<HTMLInputElement>(null);

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

    const loadValues = async () => {
      // Try current month first (existing ratings for this period)
      const { data: curSubs } = await supabase.from("submissions").select("id")
        .eq("location_id", form.location_id)
        .eq("reporting_month", form.month)
        .eq("reporting_year", form.year);

      if (curSubs?.length) {
        const { data: curRs } = await supabase.from("responses")
          .select("metric_id,value_likert")
          .eq("submission_id", curSubs[0].id)
          .not("value_likert", "is", null);
        if (curRs?.length) {
          const pv: Record<string, number> = {};
          curRs.forEach(r => { pv[r.metric_id] = r.value_likert; });
          setPrevValues(pv);
          setValues(pv);
          return; // current month has data — use it, don't fall back
        }
      }

      // Fall back to prior month for carry-forward
      const pm = form.month === 1 ? 12 : form.month - 1;
      const py = form.month === 1 ? form.year - 1 : form.year;
      const { data: priorSubs } = await supabase.from("submissions").select("id")
        .eq("location_id", form.location_id)
        .eq("reporting_month", pm)
        .eq("reporting_year", py);
      if (!priorSubs?.length) return;
      const { data: priorRs } = await supabase.from("responses")
        .select("metric_id,value_likert")
        .eq("submission_id", priorSubs[0].id)
        .not("value_likert", "is", null);
      const pv: Record<string, number> = {};
      (priorRs || []).forEach(r => { pv[r.metric_id] = r.value_likert; });
      setPrevValues(pv);
      setValues(pv);
    };

    loadValues();
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

  // ── Excel: Download internal ratings template ─────────────────────────────
  const downloadInternalTemplate = async () => {
    if (!form.location_id) return;
    setXlDownloading(true);
    try {
      const sup = suppliers.find(s => s.id === form.supplier_id);
      const loc = locations.find(l => l.id === form.location_id);
      const country = countries.find(c => c.id === form.country_id);
      const periodLabel = `${FULL_MONTHS[form.month - 1]} ${form.year}`;
      const priorLabel = form.month === 1 ? `Dec ${form.year - 1}` : `${FULL_MONTHS[form.month - 2]} ${form.year}`;
      const currentLabel = `${FULL_MONTHS[form.month - 1]} ${form.year}`;

      // ── Fetch existing ratings ───────────────────────────────────────────────
      // Priority: (1) current month Likert values, (2) prior month Likert values
      // Only fall back to prior month if current month has NO Likert responses at all
      let prefillValues: Record<string, number> = {};

      // Step 1: check current month for Likert responses
      const { data: curSubs } = await supabase.from("submissions").select("id")
        .eq("location_id", form.location_id)
        .eq("reporting_month", form.month)
        .eq("reporting_year", form.year);

      let currentMonthHasLikert = false;
      if (curSubs?.length) {
        const { data: curResp } = await supabase.from("responses")
          .select("metric_id,value_likert").eq("submission_id", curSubs[0].id)
          .not("value_likert", "is", null);
        if (curResp?.length) {
          currentMonthHasLikert = true;
          curResp.forEach(r => { prefillValues[r.metric_id] = r.value_likert; });
        }
      }

      // Step 2: only fall back to prior month if current month truly has no Likert data
      if (!currentMonthHasLikert) {
        const pm = form.month === 1 ? 12 : form.month - 1;
        const py = form.month === 1 ? form.year - 1 : form.year;
        const { data: priorSubs } = await supabase.from("submissions").select("id")
          .eq("location_id", form.location_id)
          .eq("reporting_month", pm)
          .eq("reporting_year", py);
        if (priorSubs?.length) {
          const { data: priorResp } = await supabase.from("responses")
            .select("metric_id,value_likert").eq("submission_id", priorSubs[0].id)
            .not("value_likert", "is", null);
          (priorResp || []).forEach(r => { prefillValues[r.metric_id] = r.value_likert; });
        }
      }

      const wb = XLSX.utils.book_new();

      // Instructions sheet
      const instrWs = XLSX.utils.aoa_to_sheet([
        ["LSP SCORECARD — INTERNAL RATINGS TEMPLATE"],
        [""],
        ["Supplier:", sup?.name || ""], ["Location:", loc?.name || ""],
        ["Country:", country?.country_name || ""], ["Period:", periodLabel],
        ["Reviewer:", form.reviewer || ""],
        [""],
        ["INSTRUCTIONS"],
        ["1. Fill in the RATING column (column D) for each metric — enter a number from 1 to 5"],
        ["2. Reference descriptions in columns E–F show what each score range means"],
        ["3. Blue pre-filled ratings are carried forward from last month — review and change if needed"],
        ["4. Do NOT change metric names, numbers or column structure"],
        ["5. Save and upload back via Enter Ratings → Excel tab"],
        [""], ["SCALE: 1 = Lowest  |  5 = Highest"],
      ]);
      instrWs["!cols"] = [{ wch: 22 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

      // Ratings sheet — columns: #, Category, Metric, Rating, Low description, High description
      // Columns: #, Category, Metric Name, Rating (1-5), Prior/Current, 1, 2, 3, 4, 5
      const prefillLabel = currentMonthHasLikert ? `Current (${currentLabel})` : `Prior (${priorLabel})`;
      const headers = ["#", "Category", "Metric Name", "Rating (1-5)", prefillLabel, "1", "2", "3", "4", "5"];
      const rows = [headers];
      metrics.forEach(m => {
        const prior = prefillValues[m.id] ?? "";
        const mAnchors = anchors
          .filter(a => a.metric_id === m.id)
          .sort((a, b) => a.score - b.score)
          .filter((a, i, arr) => i === arr.findIndex(x => x.score === a.score));
        // One description cell per score level
        const anchorDesc = [1,2,3,4,5].map(score => {
          const a = mAnchors.find(x => x.score === score);
          return a ? (a.description || a.label || "") : "";
        });
        rows.push([
          m.number,
          m.categories?.name || "",
          m.name,
          prior !== "" ? prior : "",
          prior !== "" ? prior : "",
          ...anchorDesc,
        ]);
      });

      // Build worksheet cell-by-cell for reliable styling
      // Style definitions
      const S = {
        hd:      { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "0F1B2D" } }, alignment: { horizontal: "center", vertical: "center", wrapText: false } },
        hdScore: { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "1A2E4A" } }, alignment: { horizontal: "center", vertical: "center" } },
        rating:  { fill: { fgColor: { rgb: "FFFDE7" } }, alignment: { horizontal: "center", vertical: "center" } },
        carried: { font: { bold: true, color: { rgb: "1565C0" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center" } },
        prior:   { font: { color: { rgb: "94A3B8" } }, fill: { fgColor: { rgb: "EFF6FF" } }, alignment: { horizontal: "center", vertical: "center" } },
        ref:     { font: { color: { rgb: "64748B" }, sz: 10 }, fill: { fgColor: { rgb: "F8FAFC" } }, alignment: { vertical: "center", wrapText: false } },
        s1:      { font: { color: { rgb: "92400E" }, sz: 9 }, fill: { fgColor: { rgb: "FFF7ED" } }, alignment: { wrapText: true, vertical: "top" } },
        s2:      { font: { color: { rgb: "92400E" }, sz: 9 }, fill: { fgColor: { rgb: "FEF9C3" } }, alignment: { wrapText: true, vertical: "top" } },
        s3:      { font: { color: { rgb: "3F6212" }, sz: 9 }, fill: { fgColor: { rgb: "F7FEE7" } }, alignment: { wrapText: true, vertical: "top" } },
        s4:      { font: { color: { rgb: "166534" }, sz: 9 }, fill: { fgColor: { rgb: "F0FDF4" } }, alignment: { wrapText: true, vertical: "top" } },
        s5:      { font: { color: { rgb: "1E3A5F" }, sz: 9 }, fill: { fgColor: { rgb: "EFF6FF" } }, alignment: { wrapText: true, vertical: "top" } },
      };
      const scoreStyles = [S.s1, S.s2, S.s3, S.s4, S.s5];

      // Build ws manually from rows array
      const ws: any = {};
      const range = { s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: headers.length - 1 } };
      ws["!ref"] = XLSX.utils.encode_range(range);
      ws["!cols"] = [
        { wch: 5 }, { wch: 28 }, { wch: 42 },
        { wch: 13 }, { wch: 13 },
        { wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 26 },
      ];
      ws["!rows"] = rows.map((_, i) => i === 0 ? { hpt: 22 } : { hpt: 52 });

      rows.forEach((row, r) => {
        row.forEach((val, c) => {
          const addr = XLSX.utils.encode_cell({ r, c });
          const isHeader = r === 0;
          const isRating = c === 3;
          const isPrior = c === 4;
          const isScore = c >= 5;
          const isRef = c <= 2;
          let style;
          if (isHeader) style = isScore ? S.hdScore : S.hd;
          else if (isRating) style = val !== "" ? S.carried : S.rating;
          else if (isPrior) style = S.prior;
          else if (isRef) style = S.ref;
          else if (isScore) style = scoreStyles[c - 5];
          const cellType = typeof val === "number" ? "n" : "s";
          ws[addr] = { v: val === "" ? "" : val, t: cellType, s: style };
        });
      });
      XLSX.utils.book_append_sheet(wb, ws, "Ratings Entry");

      // Metadata sheet
      const metaWs = XLSX.utils.aoa_to_sheet([
        ["METADATA — DO NOT EDIT"],
        ["template_type", "internal"],
        ["supplier_id", form.supplier_id],
        ["location_id", form.location_id],
        ["country_id", form.country_id],
        ["reporting_month", form.month],
        ["reporting_year", form.year],
        ["reviewer", form.reviewer || ""],
        ["generated_at", new Date().toISOString()],
        ["metric_ids", metrics.map(m => m.id).join(",")],
        ["metric_numbers", metrics.map(m => m.number).join(",")],
      ]);
      XLSX.utils.book_append_sheet(wb, metaWs, "_meta");

      const fn = `Internal_Ratings_${sup?.name?.replace(/\s+/g, "_")}_${loc?.name?.replace(/\s+/g, "_")}_${FULL_MONTHS[form.month - 1]}_${form.year}.xlsx`;
      XLSX.writeFile(wb, fn, { cellStyles: true });
    } catch (e) { console.error(e); }
    setXlDownloading(false);
  };

  // ── Excel: Upload internal ratings ────────────────────────────────────────
  const handleXlFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlError(""); setXlResult(null); setXlPreview([]);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const metaWs = wb.Sheets["_meta"];
      if (!metaWs) { setXlError("Invalid template — metadata sheet missing."); return; }
      const metaRows = XLSX.utils.sheet_to_json(metaWs, { header: 1 });
      const meta = {};
      metaRows.slice(1).forEach(row => { if (row[0] && row[1] !== undefined) meta[row[0]] = String(row[1]); });

      if (meta["template_type"] !== "internal") { setXlError("Wrong template type — please upload an Internal Ratings template."); return; }
      const supplierId = meta["supplier_id"], locationId = meta["location_id"];
      const countryId = meta["country_id"], month = Number(meta["reporting_month"]);
      const year = Number(meta["reporting_year"]), reviewer = meta["reviewer"] || form.reviewer || "Excel upload";
      const metricIds = meta["metric_ids"]?.split(",") || [];
      const metricNumbers = meta["metric_numbers"]?.split(",").map(Number) || [];

      if (!supplierId || !locationId || !month || !year) { setXlError("Metadata incomplete. Download a fresh template."); return; }

      const dataWs = wb.Sheets["Ratings Entry"];
      if (!dataWs) { setXlError("Ratings Entry sheet not found."); return; }
      const rows = XLSX.utils.sheet_to_json(dataWs, { header: 1 });
      const parsed = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const metricNumber = Number(row[0]);
        const metricName = String(row[2] || "");
        const ratingRaw = row[3];
        const idx = metricNumbers.indexOf(metricNumber);
        if (idx === -1 || isNaN(metricNumber)) continue;
        const value = ratingRaw !== null && ratingRaw !== undefined && ratingRaw !== "" ? Number(ratingRaw) : null;
        if (value !== null && (value < 1 || value > 5 || !Number.isInteger(value))) continue;
        parsed.push({ metric_id: metricIds[idx], metric_number: metricNumber, metric_name: metricName, value });
      }
      const filled = parsed.filter(p => p.value !== null);
      if (!filled.length) { setXlError("No ratings found. Fill in the Rating column (1-5)."); return; }
      setXlPreview(parsed);
      setXlResult({ supplierId, locationId, countryId, month, year, reviewer, parsed, filled });
    } catch (e) { setXlError(`Failed to read file: ${e.message}`); }
    if (xlFileRef.current) xlFileRef.current.value = "";
  };

  const confirmXlUpload = async () => {
    if (!xlResult) return;
    setXlUploading(true);
    try {
      const { supplierId, locationId, countryId, month, year, reviewer, filled } = xlResult;
      const { data: existing } = await supabase.from("submissions").select("id")
        .eq("location_id", locationId).eq("reporting_month", month).eq("reporting_year", year);
      let subId;
      if (existing?.length) {
        subId = existing[0].id;
        const intIds = new Set(filled.map(f => f.metric_id));
        const { data: existingResp } = await supabase.from("responses").select("id,metric_id").eq("submission_id", subId);
        const toDelete = (existingResp || []).filter(r => intIds.has(r.metric_id)).map(r => r.id);
        if (toDelete.length) await supabase.from("responses").delete().in("id", toDelete);
        await supabase.from("submissions").update({ reviewed_by: reviewer, reviewed_at: new Date().toISOString() }).eq("id", subId);
      } else {
        const { data: newSub, error } = await supabase.from("submissions").insert({
          location_id: locationId, supplier_id: supplierId, country_id: countryId,
          reporting_month: month, reporting_year: year,
          reviewed_by: reviewer, reviewed_at: new Date().toISOString(), status: "draft"
        }).select("id");
        if (error) throw error;
        subId = newSub[0].id;
      }
      for (const f of filled) {
        const { data: ex } = await supabase.from("responses").select("id").eq("submission_id", subId).eq("metric_id", f.metric_id);
        if (ex?.length) await supabase.from("responses").update({ value_likert: f.value, entered_by: reviewer }).eq("id", ex[0].id);
        else await supabase.from("responses").insert({ submission_id: subId, metric_id: f.metric_id, value_likert: f.value, entered_by: reviewer });
      }
      setXlResult({ ...xlResult, success: true, filledCount: filled.length, month, year });
      setXlPreview([]);
      toast({ title: `${filled.length} ratings saved via Excel upload` });
    } catch (e) { setXlError(`Upload failed: ${e.message}`); }
    setXlUploading(false);
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
        .er-lbtn-score{font-size:15px;font-weight:800;line-height:1;margin-bottom:5px}
        .er-lbtn-desc{font-size:9.5px;line-height:1.35;color:#64748B;margin-top:0}
        .er-lbtn.sel .er-lbtn-desc{color:rgba(255,255,255,0.85)}
        .er-lbtn.carried-val .er-lbtn-desc{color:#1D4ED8}

        .er-confirm{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px}
        .er-confirm h3{font-size:14px;font-weight:700;color:#15803D;margin:0 0 12px}
        .er-check-row{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
        .er-check{width:18px;height:18px;accent-color:#059669;flex-shrink:0;margin-top:2px}
        .er-check-text{font-size:13.5px;color:#374151;line-height:1.5}
        .er-save-btn{height:40px;padding:0 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;margin-top:14px}
        .er-save-btn:hover{background:#047857}
        .er-save-btn:disabled{background:#6EE7B7;cursor:not-allowed}
        .er-prev-note{font-size:11.5px;color:#94A3B8;margin-top:3px}
        /* Excel section */
        .er-excel-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .er-excel-title{font-size:15px;font-weight:700;color:#0F1B2D;margin:0 0 4px}
        .er-excel-sub{font-size:13px;color:#64748B;margin:0 0 18px}
        .er-excel-divider{border:none;border-top:2px dashed #E2E8F0;margin:8px 0 20px}
        .er-excel-btn{height:40px;padding:0 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:"DM Sans",sans-serif;display:flex;align-items:center;gap:8px}
        .er-excel-btn:hover{background:#047857}
        .er-excel-btn:disabled{opacity:0.5;cursor:not-allowed}
        .er-upload-zone{border:2px dashed #CBD5E1;border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:#FAFBFC;transition:all 0.2s}
        .er-upload-zone:hover{border-color:#059669;background:#F0FDF4}
        .er-preview-tbl{width:100%;border-collapse:collapse}
        .er-preview-tbl thead th{background:#F8FAFC;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:8px 14px;border-bottom:1px solid #E2E8F0;text-align:left}
        .er-preview-tbl thead th.r{text-align:right}
        .er-preview-tbl tbody tr{border-bottom:1px solid #F8FAFC}
        .er-preview-tbl td{padding:9px 14px;font-size:13px;color:#334155}
        .er-preview-tbl td.v{text-align:right;font-weight:700;color:#059669}
        .er-preview-tbl td.e{text-align:right;color:#CBD5E1;font-style:italic}
        .er-excel-success{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:20px;text-align:center}
        .er-excel-error{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#B91C1C;font-weight:500}
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

      {/* ── Excel Template Section ──────────────────────────────────── */}
      <div style={{borderTop:"2px dashed #E2E8F0",paddingTop:20,marginTop:4}}>
        <div style={{fontSize:13,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:16}}>
          Excel Template — Alternative Entry Method
        </div>

        {/* Download */}
        <div className="er-excel-card" style={{marginBottom:16}}>
          <div className="er-excel-title">Download Ratings Template</div>
          <div className="er-excel-sub">
            Pre-filled with last month's carry-forward values (blue). Fill in the Rating column (1–5) and upload below.
          </div>
          {form.location_id ? (
            <button className="er-excel-btn" onClick={downloadInternalTemplate} disabled={xlDownloading}>
              {xlDownloading ? "Generating…" : (
                <>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Download Ratings Template
                </>
              )}
            </button>
          ) : (
            <div style={{fontSize:13,color:"#94A3B8"}}>Select supplier, location and period above first.</div>
          )}
        </div>

        {/* Upload */}
        <div className="er-excel-card">
          <div className="er-excel-title">Upload Filled Template</div>
          <div className="er-excel-sub">Upload your completed ratings file. Ratings are saved and merged with any existing LSP data.</div>

          {xlResult?.success ? (
            <div className="er-excel-success">
              <div style={{fontSize:28,marginBottom:8}}>✅</div>
              <div style={{fontSize:15,fontWeight:700,color:"#0F1B2D",marginBottom:4}}>Ratings uploaded</div>
              <div style={{fontSize:13,color:"#64748B",marginBottom:14}}>{xlResult.filledCount} ratings saved for {FULL_MONTHS[xlResult.month-1]} {xlResult.year}</div>
              <button style={{height:36,padding:"0 16px",background:"#fff",color:"#475569",border:"1.5px solid #E2E8F0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}
                onClick={()=>{setXlResult(null);setXlPreview([]);setXlError("");}}>Upload Another</button>
            </div>
          ) : xlPreview.length > 0 ? (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#1D4ED8"}}>
                <strong>{xlPreview.filter(r=>r.value!==null).length} of {xlPreview.length} ratings filled.</strong> Review and confirm.
              </div>
              <div style={{overflow:"auto",maxHeight:260,border:"1px solid #E2E8F0",borderRadius:8}}>
                <table className="er-preview-tbl">
                  <thead><tr><th>#</th><th>Metric</th><th className="r">Rating</th></tr></thead>
                  <tbody>
                    {xlPreview.map(r=>(
                      <tr key={r.metric_id}>
                        <td style={{width:32,fontWeight:600,color:"#0F1B2D"}}>{r.metric_number}</td>
                        <td>{r.metric_name}</td>
                        {r.value!==null ? <td className="v">{r.value}/5</td> : <td className="e">not filled</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {xlError && <div className="er-excel-error">⚠ {xlError}</div>}
              <div style={{display:"flex",gap:10}}>
                <button style={{height:40,padding:"0 20px",background:"#059669",color:"#fff",border:"none",borderRadius:8,fontSize:13.5,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}
                  onClick={confirmXlUpload} disabled={xlUploading}>
                  {xlUploading ? "Saving…" : `✓ Save ${xlPreview.filter(r=>r.value!==null).length} ratings`}
                </button>
                <button style={{height:40,padding:"0 16px",background:"#fff",color:"#475569",border:"1.5px solid #E2E8F0",borderRadius:8,fontSize:13.5,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}
                  onClick={()=>{setXlPreview([]);setXlResult(null);setXlError("");}}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {xlError && <div className="er-excel-error" style={{marginBottom:12}}>⚠ {xlError}</div>}
              <div className="er-upload-zone" onClick={()=>xlFileRef.current?.click()}>
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{margin:"0 auto 8px"}}><path d="M16 4v16M10 14l6-6 6 6M6 24h20" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{fontSize:14,fontWeight:600,color:"#0F1B2D",marginBottom:4}}>Drop Excel file here</div>
                <div style={{fontSize:12.5,color:"#64748B",marginBottom:10}}>.xlsx files only</div>
                <button style={{height:34,padding:"0 14px",background:"#fff",color:"#059669",border:"1.5px solid #BBF7D0",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}
                  onClick={e=>{e.stopPropagation();xlFileRef.current?.click();}}>Browse Files</button>
              </div>
              <input ref={xlFileRef} type="file" accept=".xlsx" style={{display:"none"}} onChange={handleXlFile}/>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
