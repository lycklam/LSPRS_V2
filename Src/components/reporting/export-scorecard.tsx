// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx/dist/xlsx.full.min.js";

const MONTHS = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CAT_HEX = ["2563EB","F59E0B","10B981","8B5CF6","EF4444","06B6D4"];
const CAT_LT  = ["DBEAFE","FEF3C7","D1FAE5","EDE9FE","FEE2E2","CFFAFE"];

const SEL = {
  height: "38px", padding: "0 12px", border: "1.5px solid #CBD5E1",
  borderRadius: "8px", fontSize: "14px", color: "#0F1B2D", background: "#fff",
  outline: "none", fontFamily: "'DM Sans',sans-serif", width: "100%",
  appearance: "none" as const, WebkitAppearance: "none" as const, cursor: "pointer",
  paddingRight: "36px",
};

function sc(v) {
  if (!v && v !== 0) return {};
  const n = Number(v);
  const col = n >= 80 ? "059669" : n >= 60 ? "D97706" : "DC2626";
  return { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: col } }, alignment: { horizontal: "center", vertical: "center" } };
}

function buildSheet(wb, name, locName, months, allMetrics, categories, relevantIds, respByMonth, catByMonth, overallByMonth, type) {
  const ws = {};
  const metrics = allMetrics.filter(m => m.reported_by === type);
  const FIXED = 3;
  let r = 0;

  const C = (row, col) => XLSX.utils.encode_cell({ r: row, c: col });
  const mk = (v, s) => ({ v: v === null || v === undefined ? "" : v, t: typeof v === "number" ? "n" : "s", s: s || {} });

  const hdS = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "0F1B2D" } }, alignment: { horizontal: "center", vertical: "center" } };
  const moS = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "1A2E4A" } }, alignment: { horizontal: "center", vertical: "center" } };
  const totS = { font: { bold: true, color: { rgb: "0F1B2D" }, sz: 10 }, fill: { fgColor: { rgb: "E2E8F0" } }, alignment: { horizontal: "left", vertical: "center" } };
  const totSc = { font: { bold: true, color: { rgb: "0F1B2D" }, sz: 10 }, fill: { fgColor: { rgb: "E2E8F0" } }, alignment: { horizontal: "center", vertical: "center" } };

  // Header
  ws[C(r,0)] = mk("#", hdS);
  ws[C(r,1)] = mk("Category", hdS);
  ws[C(r,2)] = mk("Metric", hdS);
  months.forEach((m, mi) => { ws[C(r, FIXED+mi)] = mk(m.label, moS); });
  r++;

  // Group by category
  categories.forEach((cat, ci) => {
    const catMetrics = metrics.filter(m => m.category_id === cat.id);
    if (!catMetrics.length) return;

    const catS = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: CAT_HEX[ci%6] } }, alignment: { horizontal: "left", vertical: "center" } };
    ws[C(r,0)] = mk(cat.number, catS);
    ws[C(r,1)] = mk(cat.name, catS);
    ws[C(r,2)] = mk(`${cat.weight_pct}%   .   max ${cat.max_points} pts`, catS);
    months.forEach((_, mi) => { ws[C(r, FIXED+mi)] = mk("", catS); });
    r++;

    catMetrics.forEach(m => {
      const active = relevantIds.has(m.id);
      const nmS = active
        ? { font: { color: { rgb: "0F1B2D" }, sz: 9 }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "left", vertical: "center", wrapText: true } }
        : { font: { color: { rgb: "94A3B8" }, sz: 9 }, fill: { fgColor: { rgb: "F8FAFC" } }, alignment: { horizontal: "left", vertical: "center", wrapText: true } };
      const refS = { font: { color: { rgb: "94A3B8" }, sz: 9 }, alignment: { horizontal: "center", vertical: "center" } };

      ws[C(r,0)] = mk(m.number, refS);
      ws[C(r,1)] = mk(cat.name, { font: { color: { rgb: "64748B" }, sz: 9 }, alignment: { horizontal: "left" } });
      ws[C(r,2)] = mk(m.name, nmS);

      months.forEach((mo, mi) => {
        if (!active) {
          ws[C(r, FIXED+mi)] = mk("-", { font: { color: { rgb: "CBD5E1" }, sz: 9 }, fill: { fgColor: { rgb: "F8FAFC" } }, alignment: { horizontal: "center" } });
        } else {
          const resp = respByMonth[mo.key] && respByMonth[mo.key][m.id];
          const val = resp ? resp.val : "";
          const dispVal = val !== null && val !== undefined && val !== ""
            ? (type === "lsp" && m.input_type === "percent" ? `${val}%` : val)
            : "";
          const valS = active
            ? { font: { color: { rgb: "0F1B2D" }, sz: 9, bold: type==="internal" }, fill: { fgColor: { rgb: CAT_LT[ci%6] } }, alignment: { horizontal: "center", vertical: "center" } }
            : {};
          ws[C(r, FIXED+mi)] = mk(dispVal, dispVal ? valS : { fill: { fgColor: { rgb: "F8FAFC" } }, alignment: { horizontal: "center" } });
        }
      });
      r++;
    });

    // Category score row
    ws[C(r,0)] = mk("", totS);
    ws[C(r,1)] = mk("", totS);
    ws[C(r,2)] = mk(`-> ${cat.name} score`, totS);
    months.forEach((mo, mi) => {
      const s = catByMonth[mo.key] && catByMonth[mo.key][cat.id];
      ws[C(r, FIXED+mi)] = s !== undefined
        ? mk(`${s}/${cat.weight_pct}`, sc((s/cat.weight_pct)*100))
        : mk("", totSc);
    });
    r++;
  });

  // Overall score
  ws[C(r,0)] = mk("", totS);
  ws[C(r,1)] = mk("", totS);
  ws[C(r,2)] = mk("OVERALL SCORE / 100", totS);
  months.forEach((mo, mi) => {
    const s = overallByMonth[mo.key];
    ws[C(r, FIXED+mi)] = s !== undefined ? mk(s, sc(s)) : mk("", totSc);
  });
  r++;

  // Status row
  ws[C(r,0)] = mk("", {});
  ws[C(r,1)] = mk("", {});
  ws[C(r,2)] = mk("Status", { font: { color: { rgb: "64748B" }, sz: 9 }, alignment: { horizontal: "left" } });
  months.forEach((mo, mi) => {
    const st = mo.status || "";
    const stCol = st === "approved" ? "059669" : st === "flagged" ? "DC2626" : st === "submitted" ? "D97706" : "94A3B8";
    ws[C(r, FIXED+mi)] = mk(st ? st.charAt(0).toUpperCase()+st.slice(1) : "-", { font: { color: { rgb: stCol }, sz: 9, bold: true }, alignment: { horizontal: "center" } });
  });
  r++;

  ws["!ref"] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r:r-1, c:FIXED+months.length-1 } });
  ws["!cols"] = [{ wch:5 }, { wch:26 }, { wch:42 }, ...months.map(()=>({ wch:14 }))];
  ws["!rows"] = Array.from({ length: r }, (_, i) => ({ hpt: i===0 ? 20 : 18 }));

  XLSX.utils.book_append_sheet(wb, ws, name.substring(0,31));
}

export default function ExportScorecard() {
  const [suppliers, setSuppliers] = useState([]);
  const [selSupplier, setSelSupplier] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [exportType, setExportType] = useState("both");
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.from("suppliers").select("id,name").eq("status","active").order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  const runExport = async () => {
    if (!selSupplier) return;
    setExporting(true);
    setStatus("Loading data...");
    try {
      const [
        { data: categories },
        { data: allMetrics },
        { data: locations },
        { data: relRows },
      ] = await Promise.all([
        supabase.from("categories").select("*").order("number"),
        supabase.from("metrics").select("*").order("number"),
        supabase.from("locations").select("id,name,countries(id,country_name)").eq("supplier_id",selSupplier).eq("status","active").order("name"),
        supabase.from("metric_relevance").select("metric_id,location_id,is_relevant").eq("supplier_id",selSupplier),
      ]);

      const { data: submissions } = await supabase
        .from("submissions").select("id,location_id,reporting_month,reporting_year,status")
        .eq("supplier_id",selSupplier).eq("reporting_year",Number(year)).order("reporting_month");

      if (!submissions?.length) { setStatus("No submissions found."); setExporting(false); return; }

      setStatus("Loading responses...");
      const subIds = submissions.map(s => s.id);
      const [{ data: responses }, { data: catScores }, { data: overallScores }] = await Promise.all([
        supabase.from("responses").select("submission_id,metric_id,value_numeric,value_likert,points_earned").in("submission_id",subIds),
        supabase.from("category_scores").select("submission_id,category_id,normalized_score").in("submission_id",subIds),
        supabase.from("overall_scores").select("submission_id,total_score").in("submission_id",subIds),
      ]);

      setStatus("Building workbook...");

      // Index
      const subIdx = {};
      submissions.forEach(s => { subIdx[`${s.location_id}|${s.reporting_month}`] = s; });
      const respIdx = {};
      (responses||[]).forEach(r => {
        if (!respIdx[r.submission_id]) respIdx[r.submission_id] = {};
        respIdx[r.submission_id][r.metric_id] = { val: r.value_numeric ?? r.value_likert, pts: r.points_earned };
      });
      const catIdx = {};
      (catScores||[]).forEach(cs => {
        if (!catIdx[cs.submission_id]) catIdx[cs.submission_id] = {};
        catIdx[cs.submission_id][cs.category_id] = Math.round(Number(cs.normalized_score)*10)/10;
      });
      const overallIdx = {};
      (overallScores||[]).forEach(os => { overallIdx[os.submission_id] = Math.round(Number(os.total_score)*10)/10; });

      // Relevance
      const supDef = {}, locOv = {};
      (relRows||[]).forEach(r => {
        if (!r.location_id) supDef[r.metric_id] = r.is_relevant;
        else { if (!locOv[r.location_id]) locOv[r.location_id] = {}; locOv[r.location_id][r.metric_id] = r.is_relevant; }
      });
      const getRelevant = (locId) => {
        const s = new Set();
        (allMetrics||[]).forEach(m => {
          let rel = true;
          if (supDef[m.id] !== undefined) rel = supDef[m.id];
          if (locOv[locId]?.[m.id] !== undefined) rel = locOv[locId][m.id];
          if (rel) s.add(m.id);
        });
        return s;
      };

      // Month columns
      const usedMonths = new Set(submissions.map(s => s.reporting_month));
      const monthCols = Array.from({length:12},(_,i)=>i+1).filter(m=>usedMonths.has(m))
        .map(m => ({ key:`${year}-${m}`, label:`${MONTHS[m]} ${year}`, month:m }));

      const supName = (suppliers.find(s=>s.id===selSupplier)||{name:"Supplier"}).name;
      const wbLsp = XLSX.utils.book_new();
      const wbInt = XLSX.utils.book_new();

      // Summary sheet
      const mkSummary = (type) => {
        const ws = {};
        ws["A1"] = { v:`${supName} - ${type==="lsp"?"LSP KPIs":"Internal Ratings"} ${year}`, t:"s", s:{ font:{bold:true,color:{rgb:"FFFFFF"},sz:12}, fill:{fgColor:{rgb:"0F1B2D"}}, alignment:{horizontal:"left",vertical:"center"} } };
        ws["A2"] = { v:`Exported: ${new Date().toLocaleDateString()}  |  ${locations?.length||0} locations  |  Months with data: ${monthCols.map(m=>m.label).join(", ")}`, t:"s", s:{ font:{color:{rgb:"475569"},sz:9} } };
        ws["!ref"] = "A1:Z2";
        ws["!cols"] = [{ wch:80 }];
        return ws;
      };
      XLSX.utils.book_append_sheet(wbLsp, mkSummary("lsp"), "Summary");
      XLSX.utils.book_append_sheet(wbInt, mkSummary("int"), "Summary");

      for (const loc of (locations||[])) {
        const locMonths = monthCols.map(mc => {
          const sub = subIdx[`${loc.id}|${mc.month}`];
          return { ...mc, submissionId: sub?.id||null, status: sub?.status||"" };
        });
        const respByMonth = {}, catByMonth = {}, overallByMonth = {};
        locMonths.forEach(mo => {
          if (!mo.submissionId) return;
          respByMonth[mo.key] = respIdx[mo.submissionId]||{};
          catByMonth[mo.key] = catIdx[mo.submissionId]||{};
          if (overallIdx[mo.submissionId] !== undefined) overallByMonth[mo.key] = overallIdx[mo.submissionId];
        });
        const relIds = getRelevant(loc.id);
        const cn = loc.countries?.country_name||"";
        const sn = `${cn.substring(0,8)}_${loc.name.substring(0,18)}`;
        if (exportType !== "internal") buildSheet(wbLsp, sn, loc.name, locMonths, allMetrics||[], categories||[], relIds, respByMonth, catByMonth, overallByMonth, "lsp");
        if (exportType !== "lsp") buildSheet(wbInt, sn, loc.name, locMonths, allMetrics||[], categories||[], relIds, respByMonth, catByMonth, overallByMonth, "internal");
      }

      const sn = supName.replace(/\s+/g,"_");
      if (exportType !== "internal") XLSX.writeFile(wbLsp, `${sn}_LSP_KPIs_${year}.xlsx`, { cellStyles:true });
      if (exportType !== "lsp") XLSX.writeFile(wbInt, `${sn}_Internal_Ratings_${year}.xlsx`, { cellStyles:true });

      setStatus(`Done Done - ${locations?.length} location${locations?.length!==1?"s":""} exported.`);
    } catch(e) {
      setStatus(`Error Failed: ${e.message}`);
      console.error(e);
    }
    setExporting(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:680 }}>
      <style>{`
        .esc-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,.06)}
        .esc-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .esc-lbl{font-size:12px;font-weight:700;color:#475569;letter-spacing:.02em;text-transform:uppercase;margin-bottom:5px}
        .esc-type-row{display:flex;gap:8px;flex-wrap:wrap}
        .esc-tb{flex:1;min-width:140px;height:40px;border-radius:8px;border:1.5px solid #E2E8F0;background:#fff;font-size:13px;font-weight:500;color:#475569;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
        .esc-tb:hover{border-color:#93C5FD;color:#2563EB;background:#EFF6FF}
        .esc-tb.active{border-color:#2563EB;background:#2563EB;color:#fff;font-weight:600}
        .esc-btn{height:44px;padding:0 28px;background:#059669;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:10px}
        .esc-btn:hover{background:#047857}
        .esc-btn:disabled{background:#6EE7B7;cursor:not-allowed}
        .esc-status{font-size:13px;font-weight:500;padding:10px 14px;border-radius:8px;margin-top:4px}
        .esc-status.ok{background:#F0FDF4;color:#059669;border:1px solid #BBF7D0}
        .esc-status.err{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA}
        .esc-status.loading{background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE}
        .esc-legend{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
        .esc-li{display:flex;align-items:center;gap:8px;font-size:12px;color:#475569}
        .esc-sw{width:28px;height:14px;border-radius:3px;flex-shrink:0}
        .esc-mono{font-family:monospace;font-size:11.5px;color:#334155;line-height:1.9;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px}
      `}</style>

      {/* Selector */}
      <div className="esc-card">
        <div style={{fontSize:15,fontWeight:700,color:"#0F1B2D",marginBottom:4}}>Scorecard Export</div>
        <div style={{fontSize:13,color:"#64748B",marginBottom:20}}>One Excel file per type  .  One tab per location  .  Months as columns  .  All metrics shown (inactive greyed out)</div>
        <div className="esc-grid">
          <div>
            <div className="esc-lbl">Supplier</div>
            <select style={SEL} value={selSupplier} onChange={e=>setSelSupplier(e.target.value)}>
              <option value="">- Select -</option>
              {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div className="esc-lbl">Year</div>
            <select style={SEL} value={year} onChange={e=>setYear(e.target.value)}>
              {[2024,2025,2026,2027].map(y=><option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Export type */}
      <div className="esc-card">
        <div style={{fontSize:13,fontWeight:700,color:"#0F1B2D",marginBottom:12}}>Export Type</div>
        <div className="esc-type-row">
          {[["both"," Both files"],["lsp"," LSP KPIs only"],["internal"," Internal Ratings only"]].map(([k,l])=>(
            <button key={k} className={`esc-tb${exportType===k?" active":""}`} onClick={()=>setExportType(k)}>{l}</button>
          ))}
        </div>
        <div className="esc-legend">
          <div className="esc-li"><div className="esc-sw" style={{background:"#DBEAFE"}}/> Active metric with data</div>
          <div className="esc-li"><div className="esc-sw" style={{background:"#F8FAFC",border:"1px solid #E2E8F0"}}/> Inactive metric (greyed)</div>
          <div className="esc-li"><div className="esc-sw" style={{background:"#059669"}}/> Score &gt;= 80 (green)</div>
          <div className="esc-li"><div className="esc-sw" style={{background:"#D97706"}}/> Score 60-79 (amber)</div>
          <div className="esc-li"><div className="esc-sw" style={{background:"#DC2626"}}/> Score &lt; 60 (red)</div>
          <div className="esc-li"><div className="esc-sw" style={{background:"#E2E8F0"}}/> Category / total row</div>
        </div>
      </div>

      {/* Button + status */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <button className="esc-btn" onClick={runExport} disabled={!selSupplier||exporting}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {exporting ? "Exporting..." : `Download Excel${exportType==="both"?" Files":" File"}`}
        </button>
        {status && (
          <div className={`esc-status ${status.startsWith("Done")?"ok":status.startsWith("Error")?"err":"loading"}`}>
            {status}
          </div>
        )}
      </div>

      {/* Structure */}
      <div className="esc-card" style={{background:"#F8FAFC"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Output structure</div>
        <div className="esc-mono">
           Supplier_LSP_KPIs_2026.xlsx<br/>
          &nbsp;&nbsp;|-- Summary<br/>
          &nbsp;&nbsp;|-- Germany_Langenbach &nbsp; rows=metrics, cols=months<br/>
          &nbsp;&nbsp;|-- Czechoslovakia_Prague<br/>
          <br/>
           Supplier_Internal_Ratings_2026.xlsx<br/>
          &nbsp;&nbsp;|-- Summary<br/>
          &nbsp;&nbsp;|-- ...same locations
        </div>
      </div>
    </div>
  );
}
