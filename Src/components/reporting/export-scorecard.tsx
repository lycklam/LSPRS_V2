// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx/dist/xlsx.full.min.js";

const MO = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CH = ["2563EB","F59E0B","10B981","8B5CF6","EF4444","06B6D4"];
const CL = ["DBEAFE","FEF3C7","D1FAE5","EDE9FE","FEE2E2","CFFAFE"];

const SS = { height:"38px",padding:"0 12px",border:"1.5px solid #CBD5E1",borderRadius:"8px",fontSize:"14px",color:"#0F1B2D",background:"#fff",outline:"none",fontFamily:"'DM Sans',sans-serif",width:"100%",cursor:"pointer" };
const LB = { fontSize:12,fontWeight:700,color:"#475569",letterSpacing:"0.02em",textTransform:"uppercase",marginBottom:5 };
const CARD = { background:"#fff",border:"1px solid #E2E8F0",borderRadius:12,padding:24,boxShadow:"0 1px 3px rgba(15,27,45,.06)" };

function sc(v) {
  if (!v && v!==0) return {};
  const n=Number(v),col=n>=80?"059669":n>=60?"D97706":"DC2626";
  return {font:{bold:true,color:{rgb:"FFFFFF"},sz:10},fill:{fgColor:{rgb:col}},alignment:{horizontal:"center",vertical:"center"}};
}

function mk(v,s){ return {v:v===null||v===undefined?"":v,t:typeof v==="number"?"n":"s",s:s||{}}; }

function buildSheet(wb,name,months,allMetrics,categories,relIds,respByMonth,catByMonth,overallByMonth,type){
  const ws={};
  const metrics=allMetrics.filter(m=>m.reported_by===type);
  const FIXED=3;
  let r=0;
  const C=(row,col)=>XLSX.utils.encode_cell({r:row,c:col});
  const hdS={font:{bold:true,color:{rgb:"FFFFFF"},sz:10},fill:{fgColor:{rgb:"0F1B2D"}},alignment:{horizontal:"center",vertical:"center"}};
  const moS={font:{bold:true,color:{rgb:"FFFFFF"},sz:10},fill:{fgColor:{rgb:"1A2E4A"}},alignment:{horizontal:"center",vertical:"center"}};
  const totS={font:{bold:true,color:{rgb:"0F1B2D"},sz:10},fill:{fgColor:{rgb:"E2E8F0"}},alignment:{horizontal:"left",vertical:"center"}};
  const totSc={font:{bold:true,color:{rgb:"0F1B2D"},sz:10},fill:{fgColor:{rgb:"E2E8F0"}},alignment:{horizontal:"center",vertical:"center"}};
  ws[C(r,0)]=mk("#",hdS); ws[C(r,1)]=mk("Category",hdS); ws[C(r,2)]=mk("Metric",hdS);
  months.forEach((m,mi)=>{ws[C(r,FIXED+mi)]=mk(m.label,moS);});
  r++;
  categories.forEach((cat,ci)=>{
    const catMetrics=metrics.filter(m=>m.category_id===cat.id);
    if(!catMetrics.length) return;
    const catS={font:{bold:true,color:{rgb:"FFFFFF"},sz:10},fill:{fgColor:{rgb:CH[ci%6]}},alignment:{horizontal:"left",vertical:"center"}};
    ws[C(r,0)]=mk(cat.number,catS); ws[C(r,1)]=mk(cat.name,catS); ws[C(r,2)]=mk(cat.weight_pct+"% max "+cat.max_points+" pts",catS);
    months.forEach((_,mi)=>{ws[C(r,FIXED+mi)]=mk("",catS);}); r++;
    catMetrics.forEach(m=>{
      const active=relIds.has(m.id);
      const nmS=active?{font:{color:{rgb:"0F1B2D"},sz:9},fill:{fgColor:{rgb:"FFFFFF"}},alignment:{horizontal:"left",vertical:"center",wrapText:true}}
                      :{font:{color:{rgb:"94A3B8"},sz:9},fill:{fgColor:{rgb:"F8FAFC"}},alignment:{horizontal:"left",vertical:"center",wrapText:true}};
      ws[C(r,0)]=mk(m.number,{font:{color:{rgb:"94A3B8"},sz:9},alignment:{horizontal:"center"}});
      ws[C(r,1)]=mk(cat.name,{font:{color:{rgb:"64748B"},sz:9},alignment:{horizontal:"left"}});
      ws[C(r,2)]=mk(m.name,nmS);
      months.forEach((mo,mi)=>{
        if(!active){ws[C(r,FIXED+mi)]=mk("-",{font:{color:{rgb:"CBD5E1"},sz:9},fill:{fgColor:{rgb:"F8FAFC"}},alignment:{horizontal:"center"}});return;}
        const resp=respByMonth[mo.key]&&respByMonth[mo.key][m.id];
        const val=resp?resp.val:"";
        const disp=val!==null&&val!==undefined&&val!==""?(type==="lsp"&&m.input_type==="percent"?val+"%":val):"";
        ws[C(r,FIXED+mi)]=mk(disp,disp?{font:{color:{rgb:"0F1B2D"},sz:9,bold:type==="internal"},fill:{fgColor:{rgb:CL[ci%6]}},alignment:{horizontal:"center",vertical:"center"}}:{fill:{fgColor:{rgb:"F8FAFC"}},alignment:{horizontal:"center"}});
      }); r++;
    });
    ws[C(r,0)]=mk("",totS); ws[C(r,1)]=mk("",totS); ws[C(r,2)]=mk("-> "+cat.name+" score",totS);
    months.forEach((mo,mi)=>{const s=catByMonth[mo.key]&&catByMonth[mo.key][cat.id];ws[C(r,FIXED+mi)]=s!==undefined?mk(s+"/"+cat.weight_pct,sc((s/cat.weight_pct)*100)):mk("",totSc);}); r++;
  });
  ws[C(r,0)]=mk("",totS); ws[C(r,1)]=mk("",totS); ws[C(r,2)]=mk("OVERALL SCORE / 100",totS);
  months.forEach((mo,mi)=>{const s=overallByMonth[mo.key];ws[C(r,FIXED+mi)]=s!==undefined?mk(s,sc(s)):mk("",totSc);}); r++;
  ws[C(r,0)]=mk("",{}); ws[C(r,1)]=mk("",{}); ws[C(r,2)]=mk("Status",{font:{color:{rgb:"64748B"},sz:9},alignment:{horizontal:"left"}});
  months.forEach((mo,mi)=>{const st=mo.status||"";const stC=st==="approved"?"059669":st==="flagged"?"DC2626":st==="submitted"?"D97706":"94A3B8";ws[C(r,FIXED+mi)]=mk(st?st.charAt(0).toUpperCase()+st.slice(1):"-",{font:{color:{rgb:stC},sz:9,bold:true},alignment:{horizontal:"center"}});}); r++;
  ws["!ref"]=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:r-1,c:FIXED+months.length-1}});
  ws["!cols"]=[{wch:5},{wch:26},{wch:42},...months.map(()=>({wch:14}))];
  XLSX.utils.book_append_sheet(wb,ws,name.substring(0,31));
}

export default function ExportScorecard() {
  const [suppliers,setSuppliers]=useState([]);
  const [sel,setSel]=useState("");
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const [etype,setEtype]=useState("both");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    supabase.from("suppliers").select("id,name").eq("status","active").order("name")
      .then(({data})=>setSuppliers(data||[]));
  },[]);

  const run=async()=>{
    if(!sel) return;
    setBusy(true); setMsg("Loading...");
    try {
      const [[{data:cats},{data:metrics},{data:locs},{data:rels}],[{data:subs}]] = await Promise.all([
        Promise.all([
          supabase.from("categories").select("*").order("number"),
          supabase.from("metrics").select("*").order("number"),
          supabase.from("locations").select("id,name,countries(id,country_name)").eq("supplier_id",sel).eq("status","active").order("name"),
          supabase.from("metric_relevance").select("metric_id,location_id,is_relevant").eq("supplier_id",sel),
        ]),
        Promise.all([
          supabase.from("submissions").select("id,location_id,reporting_month,reporting_year,status").eq("supplier_id",sel).eq("reporting_year",Number(year)).order("reporting_month"),
        ])
      ]);
      if(!subs?.length){setMsg("No submissions found.");setBusy(false);return;}
      const ids=subs.map(s=>s.id);
      setMsg("Loading responses...");
      const [{data:resps},{data:catSc},{data:ovSc}]=await Promise.all([
        supabase.from("responses").select("submission_id,metric_id,value_numeric,value_likert,points_earned").in("submission_id",ids),
        supabase.from("category_scores").select("submission_id,category_id,normalized_score").in("submission_id",ids),
        supabase.from("overall_scores").select("submission_id,total_score").in("submission_id",ids),
      ]);
      setMsg("Building...");
      const subIdx={};
      subs.forEach(s=>{subIdx[s.location_id+"|"+s.reporting_month]=s;});
      const rIdx={};
      (resps||[]).forEach(r=>{if(!rIdx[r.submission_id])rIdx[r.submission_id]={};rIdx[r.submission_id][r.metric_id]={val:r.value_numeric??r.value_likert};});
      const cIdx={};
      (catSc||[]).forEach(cs=>{if(!cIdx[cs.submission_id])cIdx[cs.submission_id]={};cIdx[cs.submission_id][cs.category_id]=Math.round(Number(cs.normalized_score)*10)/10;});
      const oIdx={};
      (ovSc||[]).forEach(os=>{oIdx[os.submission_id]=Math.round(Number(os.total_score)*10)/10;});
      const sd={},lo={};
      (rels||[]).forEach(r=>{if(!r.location_id)sd[r.metric_id]=r.is_relevant;else{if(!lo[r.location_id])lo[r.location_id]={};lo[r.location_id][r.metric_id]=r.is_relevant;}});
      const getR=(lid)=>{const s=new Set();(metrics||[]).forEach(m=>{let rel=true;if(sd[m.id]!==undefined)rel=sd[m.id];if(lo[lid]?.[m.id]!==undefined)rel=lo[lid][m.id];if(rel)s.add(m.id);});return s;};
      const used=new Set(subs.map(s=>s.reporting_month));
      const mCols=Array.from({length:12},(_,i)=>i+1).filter(m=>used.has(m)).map(m=>({key:year+"-"+m,label:MO[m]+" "+year,month:m}));
      const sn=(suppliers.find(s=>s.id===sel)||{name:"Supplier"}).name;
      const wL=XLSX.utils.book_new(),wI=XLSX.utils.book_new();
      const mkSum=(t)=>{const w={};w["A1"]={v:sn+" - "+(t==="lsp"?"LSP KPIs":"Internal Ratings")+" "+year,t:"s"};w["!ref"]="A1:Z1";w["!cols"]=[{wch:60}];return w;};
      XLSX.utils.book_append_sheet(wL,mkSum("lsp"),"Summary");
      XLSX.utils.book_append_sheet(wI,mkSum("int"),"Summary");
      for(const loc of (locs||[])){
        const lm=mCols.map(mc=>{const sub=subIdx[loc.id+"|"+mc.month];return{...mc,submissionId:sub?.id||null,status:sub?.status||""};});
        const rbm={},cbm={},obm={};
        lm.forEach(mo=>{if(!mo.submissionId)return;rbm[mo.key]=rIdx[mo.submissionId]||{};cbm[mo.key]=cIdx[mo.submissionId]||{};if(oIdx[mo.submissionId]!==undefined)obm[mo.key]=oIdx[mo.submissionId];});
        const rids=getR(loc.id);
        const cn=(loc.countries?.country_name||"").substring(0,8);
        const ln=loc.name.substring(0,18);
        const shn=cn+"_"+ln;
        if(etype!=="internal") buildSheet(wL,shn,lm,metrics||[],cats||[],rids,rbm,cbm,obm,"lsp");
        if(etype!=="lsp") buildSheet(wI,shn,lm,metrics||[],cats||[],rids,rbm,cbm,obm,"internal");
      }
      const fn=sn.replace(/\s+/g,"_");
      if(etype!=="internal") XLSX.writeFile(wL,fn+"_LSP_KPIs_"+year+".xlsx",{cellStyles:true});
      if(etype!=="lsp") XLSX.writeFile(wI,fn+"_Internal_Ratings_"+year+".xlsx",{cellStyles:true});
      setMsg("Done - "+(locs?.length||0)+" location(s) exported.");
    } catch(e){setMsg("Error: "+e.message);console.error(e);}
    setBusy(false);
  };

  const msgColor=msg.startsWith("Done")?"#059669":msg.startsWith("Error")?"#DC2626":"#2563EB";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth:680}}>
      <div style={CARD}>
        <div style={{fontSize:15,fontWeight:700,color:"#0F1B2D",marginBottom:4}}>Scorecard Export</div>
        <div style={{fontSize:13,color:"#64748B",marginBottom:20}}>One Excel file per type. One tab per location. Months as columns. All metrics shown (inactive greyed out).</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
            <div style={LB}>Supplier</div>
            <select style={SS} value={sel} onChange={e=>setSel(e.target.value)}>
              <option value="">-- Select --</option>
              {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div style={LB}>Year</div>
            <select style={SS} value={year} onChange={e=>setYear(e.target.value)}>
              {[2024,2025,2026,2027].map(y=><option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{fontSize:13,fontWeight:700,color:"#0F1B2D",marginBottom:12}}>Export Type</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[["both","Both files"],["lsp","LSP KPIs only"],["internal","Internal Ratings only"]].map(([k,l])=>(
            <button key={k} onClick={()=>setEtype(k)} style={{flex:1,minWidth:140,height:40,borderRadius:8,border:etype===k?"2px solid #2563EB":"1.5px solid #E2E8F0",background:etype===k?"#2563EB":"#fff",color:etype===k?"#fff":"#475569",fontSize:13,fontWeight:etype===k?600:500,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:16}}>
          {[["#DBEAFE","Active metric with data"],["#F8FAFC","Inactive/greyed"],["#059669","Score 80+ (green)"],["#D97706","Score 60-79 (amber)"],["#DC2626","Score below 60 (red)"],["#E2E8F0","Category/total row"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#475569"}}>
              <div style={{width:24,height:12,borderRadius:3,background:c,border:"1px solid #E2E8F0",flexShrink:0}}/>
              {l}
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <button onClick={run} disabled={!sel||busy} style={{height:44,padding:"0 28px",background:(!sel||busy)?"#6EE7B7":"#059669",color:"#fff",border:"none",borderRadius:9,fontSize:14,fontWeight:600,cursor:(!sel||busy)?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:10,alignSelf:"flex-start"}}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {busy?"Exporting...":"Download Excel"+(etype==="both"?" Files":" File")}
        </button>
        {msg && <div style={{fontSize:13,fontWeight:500,color:msgColor,padding:"10px 14px",borderRadius:8,background:msg.startsWith("Done")?"#F0FDF4":msg.startsWith("Error")?"#FEF2F2":"#EFF6FF",border:"1px solid "+(msg.startsWith("Done")?"#BBF7D0":msg.startsWith("Error")?"#FECACA":"#BFDBFE")}}>{msg}</div>}
      </div>

      <div style={{...CARD,background:"#F8FAFC"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Output structure</div>
        <div style={{fontFamily:"monospace",fontSize:11.5,color:"#334155",lineHeight:1.9,background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:8,padding:"14px 16px"}}>
          <div>Supplier_LSP_KPIs_2026.xlsx</div>
          <div>&nbsp;&nbsp;|-- Summary</div>
          <div>&nbsp;&nbsp;|-- Germany_Langenbach (rows=metrics, cols=months)</div>
          <div>&nbsp;&nbsp;|-- Czechoslovakia_Prague</div>
          <div>&nbsp;</div>
          <div>Supplier_Internal_Ratings_2026.xlsx</div>
          <div>&nbsp;&nbsp;|-- Summary</div>
          <div>&nbsp;&nbsp;|-- same locations</div>
        </div>
      </div>
    </div>
  );
}
