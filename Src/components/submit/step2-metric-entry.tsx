import { useState, useEffect } from "react";
import { supabase, CAT_COLORS, calcPoints } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  selection: any;
  metricValues: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export default function Step2MetricEntry({ selection, metricValues, onChange, onBack, onContinue }: Props) {
  const [categories, setCategories] = useState<any[]>([]);
  const [allMetrics, setAllMetrics] = useState<any[]>([]);
  const [relevance, setRelevance] = useState<Record<string, boolean>>({});
  const [bands, setBands] = useState<any[]>([]);
  const [prevValues, setPrevValues] = useState<Record<string, number>>({});
  const [flags, setFlags] = useState<{name:string;reason:string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("*").order("number"),
      supabase.from("metrics").select("*, sub_categories(name)").eq("reported_by","lsp").order("sort_order"),
      supabase.from("scoring_bands").select("*").order("band_order"),
    ]).then(([c,m,b])=>{ setCategories(c.data||[]); setAllMetrics(m.data||[]); setBands(b.data||[]); setLoading(false); });
  }, []);

  useEffect(() => {
    if(!selection?.supplier_id||!allMetrics.length)return;
    supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id",selection.supplier_id)
      .then(({data})=>{
        const rel:Record<string,boolean>={};
        allMetrics.forEach(m=>{rel[m.id]=true;});
        (data||[]).forEach(r=>{rel[r.metric_id]=r.is_relevant;});
        setRelevance(rel);
      });
  }, [selection?.supplier_id,allMetrics]);

  useEffect(() => {
    if(!selection?.location_id)return;
    const pm=selection.month===1?12:selection.month-1, py=selection.month===1?selection.year-1:selection.year;
    supabase.from("submissions").select("id").eq("location_id",selection.location_id).eq("reporting_month",pm).eq("reporting_year",py)
      .then(({data})=>{
        if(!data?.length)return;
        supabase.from("responses").select("metric_id,value_numeric").eq("submission_id",data[0].id)
          .then(({data:rs})=>{ const pv:Record<string,number>={}; (rs||[]).forEach(r=>{if(r.value_numeric!==null)pv[r.metric_id]=r.value_numeric;}); setPrevValues(pv); });
      });
  }, [selection?.location_id,selection?.month,selection?.year]);

  const metrics = allMetrics.filter(m=>{
    if(relevance[m.id]===false)return false;
    if(selection?.business_type==="B2B"&&!m.applies_b2b)return false;
    if(selection?.business_type==="B2C"&&!m.applies_b2c)return false;
    return true;
  });

  const getBands=(id:string)=>bands.filter(b=>b.metric_id===id).sort((a:any,b:any)=>a.band_order-b.band_order);
  const getMatchBand=(id:string,val:string)=>{ if(!val)return null; const n=Number(val); return getBands(id).find(b=>n>=b.threshold_min&&n<=b.threshold_max)||null; };

  const detectFlags=()=>{
    const f:{name:string;reason:string}[]=[];
    metrics.forEach(m=>{
      const val=metricValues[m.id]; if(!val)return;
      if((m.number===32||m.number===34)&&Number(val)>=1)f.push({name:m.name,reason:"Zero tolerance — any incident = 0 pts"});
      if([1,2,3,4].includes(m.number)&&Number(val)<85)f.push({name:m.name,reason:`${val}% below 85% threshold`});
    });
    return f;
  };

  const handleContinue=()=>{ setFlags(detectFlags()); onContinue(); };
  const metricsByCat=categories.map(cat=>({...cat,metrics:metrics.filter(m=>m.category_id===cat.id)})).filter(c=>c.metrics.length>0);
  const filledCount=metrics.filter(m=>metricValues[m.id]!==undefined&&metricValues[m.id]!=="").length;

  if(loading)return <div className="p-12 text-center text-gray-400">Loading metrics...</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-semibold text-gray-900">Step 2 — Enter Performance Data</h2><p className="text-sm text-gray-500 mt-1">{filledCount} of {metrics.length} metrics filled · Scoring bands shown as you type</p></div>
        <Button variant="outline" onClick={onBack}>← Back</Button>
      </div>

      {flags.length>0&&(
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="font-semibold text-red-800 mb-2">⚠️ {flags.length} metric{flags.length>1?"s":""} below threshold</div>
          <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">{flags.map((f,i)=><li key={i}>{f.name} — {f.reason}</li>)}</ul>
          <p className="text-xs text-red-500 mt-2">These will be flagged for internal review after submission.</p>
        </div>
      )}

      {metricsByCat.map((cat,ci)=>(
        <div key={cat.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold" style={{background:CAT_COLORS[ci]+"22",color:CAT_COLORS[ci]}}>{cat.number}</span>
            <span className="font-semibold text-sm text-gray-800">{cat.name}</span>
            <span className="ml-auto text-xs text-gray-400">{cat.weight_pct}% · {cat.max_points} pts</span>
          </div>
          <div className="divide-y divide-gray-50">
            {cat.metrics.map(m=>{
              const val=metricValues[m.id]||"";
              const matchBand=getMatchBand(m.id,val);
              const pts=val?calcPoints(Number(val),getBands(m.id)):null;
              const prev=prevValues[m.id];
              const isZeroTol=m.number===32||m.number===34;
              const isFlagged=val&&((isZeroTol&&Number(val)>=1)||([1,2,3,4].includes(m.number)&&Number(val)<85));
              return (
                <div key={m.id} className={`p-4 ${isFlagged?"bg-red-50/50":""}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{m.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{m.sub_categories?.name&&<span>{m.sub_categories.name} · </span>}{m.input_type==="percent"?"Enter %":"Enter count"} · {m.max_points} pts max</div>
                      {prev!==undefined&&<div className="text-xs text-gray-400 mt-1">Last month: {prev}{m.input_type==="percent"?"%":""}</div>}
                      {isZeroTol&&<div className="text-xs text-amber-600 mt-1 font-medium">⚠ Zero tolerance — any incident = 0 pts</div>}
                      {matchBand&&<div className={`inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${isFlagged?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>{matchBand.label} → {matchBand.points} pts</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <Input type="number" min="0" max={m.input_type==="percent"?100:undefined} value={val} onChange={e=>onChange({...metricValues,[m.id]:e.target.value})} placeholder={m.input_type==="percent"?"0–100":"Count"} className={`w-28 text-right ${isFlagged?"border-red-300":""}`}/>
                        {m.input_type==="percent"&&<span className="text-sm text-gray-400">%</span>}
                      </div>
                      {pts!==null&&<div className={`text-xs font-semibold ${isFlagged?"text-red-600":"text-green-600"}`}>{pts} / {m.max_points} pts</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={handleContinue} className="bg-green-600 hover:bg-green-700 text-white">Review & Submit →</Button>
      </div>
    </div>
  );
}
