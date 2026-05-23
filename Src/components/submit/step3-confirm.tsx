import { useState, useEffect } from "react";
import { supabase, calcPoints, SHORT_MONTHS } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  selection: any;
  metricValues: Record<string, string>;
  onBack: () => void;
  onSuccess: (flagCount: number) => void;
}

export default function Step3Confirm({ selection, metricValues, onBack, onSuccess }: Props) {
  const [approved, setApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [bands, setBands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("metrics").select("*, sub_categories(name)").eq("reported_by","lsp").order("sort_order"),
      supabase.from("scoring_bands").select("*").order("band_order"),
    ]).then(([m,b])=>{ setMetrics(m.data||[]); setBands(b.data||[]); setLoading(false); });
  }, []);

  const getBands=(id:string)=>bands.filter(b=>b.metric_id===id).sort((a:any,b:any)=>a.band_order-b.band_order);
  const getPoints=(id:string,val:string)=>{ if(!val)return null; return calcPoints(Number(val),getBands(id)); };

  const filledMetrics=metrics.filter(m=>metricValues[m.id]!==undefined&&metricValues[m.id]!=="");
  const flaggedMetrics=filledMetrics.filter(m=>{
    const val=metricValues[m.id];
    if((m.number===32||m.number===34)&&Number(val)>=1)return true;
    if([1,2,3,4].includes(m.number)&&Number(val)<85)return true;
    return false;
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const {data:existing}=await supabase.from("submissions").select("id,status").eq("location_id",selection.location_id).eq("reporting_month",Number(selection.month)).eq("reporting_year",Number(selection.year));
      let subId:string;
      if(existing?.length){
        subId=existing[0].id;
        await supabase.from("responses").delete().eq("submission_id",subId);
        await supabase.from("threshold_flags").delete().eq("submission_id",subId);
        await supabase.from("submissions").update({submitted_by:selection.submitter,submitted_at:new Date().toISOString(),status:flaggedMetrics.length>0?"flagged":"submitted"}).eq("id",subId);
      } else {
        const {data:newSub,error}=await supabase.from("submissions").insert({location_id:selection.location_id,supplier_id:selection.supplier_id,country_id:selection.country_id,reporting_month:Number(selection.month),reporting_year:Number(selection.year),submitted_by:selection.submitter,submitted_at:new Date().toISOString(),status:flaggedMetrics.length>0?"flagged":"submitted"}).select("id");
        if(error)throw error;
        subId=newSub![0].id;
      }
      if(filledMetrics.length){
        const {error}=await supabase.from("responses").insert(filledMetrics.map(m=>({submission_id:subId,metric_id:m.id,value_numeric:Number(metricValues[m.id]),points_earned:getPoints(m.id,metricValues[m.id]),entered_by:selection.submitter,is_flagged:flaggedMetrics.some(f=>f.id===m.id)})));
        if(error)throw error;
      }
      if(flaggedMetrics.length){
        await supabase.from("threshold_flags").insert(flaggedMetrics.map(m=>({submission_id:subId,metric_id:m.id,value_entered:Number(metricValues[m.id]),flag_type:(m.number===32||m.number===34)?"zero_tolerance":"below_target"})));
      }
      toast({title:"Submission recorded",description:flaggedMetrics.length>0?`${flaggedMetrics.length} metric(s) flagged for review.`:"All data saved successfully."});
      onSuccess(flaggedMetrics.length);
    } catch(e:any){toast({title:"Submission failed",description:e.message,variant:"destructive"});}
    setSubmitting(false);
  };

  if(loading)return <div className="p-12 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-semibold text-gray-900">Step 3 — Review & Submit</h2><p className="text-sm text-gray-500 mt-1">Review your entries before final submission.</p></div>
        <Button variant="outline" onClick={onBack}>← Back</Button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Submission Summary</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Period</span><div className="font-medium">{SHORT_MONTHS[selection?.month]} {selection?.year}</div></div>
          <div><span className="text-gray-500">Submitted by</span><div className="font-medium">{selection?.submitter}</div></div>
          <div><span className="text-gray-500">Metrics entered</span><div className="font-medium">{filledMetrics.length} values</div></div>
          <div><span className="text-gray-500">Flags detected</span><div className={`font-medium ${flaggedMetrics.length>0?"text-red-600":"text-green-600"}`}>{flaggedMetrics.length>0?`⚠ ${flaggedMetrics.length} below threshold`:"✓ None"}</div></div>
        </div>
      </div>

      {flaggedMetrics.length>0&&(
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="font-semibold text-red-800 mb-2">⚠️ Flagged metrics — internal team will be notified</div>
          <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">{flaggedMetrics.map(m=><li key={m.id}>{m.name} — value: {metricValues[m.id]}{m.input_type==="percent"?"%":""}</li>)}</ul>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">Entered Values ({filledMetrics.length})</div>
        {filledMetrics.length===0?(
          <div className="p-6 text-center text-gray-400 text-sm">No metric values entered yet.</div>
        ):(
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Metric</th><th className="text-right px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Value</th><th className="text-right px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Points</th></tr></thead>
            <tbody>{filledMetrics.map(m=>{
              const val=metricValues[m.id], pts=getPoints(m.id,val);
              const isFlagged=flaggedMetrics.some(f=>f.id===m.id);
              return (
                <tr key={m.id} className={`border-b border-gray-50 ${isFlagged?"bg-red-50":""}`}>
                  <td className="px-5 py-2 text-gray-900">{m.name}</td>
                  <td className="px-5 py-2 text-right font-medium">{val}{m.input_type==="percent"?"%":""}{isFlagged&&<span className="ml-1 text-red-500">⚠</span>}</td>
                  <td className={`px-5 py-2 text-right font-semibold ${pts===0?"text-red-500":"text-green-600"}`}>{pts!==null?`${pts} / ${m.max_points}`:"—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <h3 className="font-semibold text-green-800 mb-3">✓ Confirm & Submit</h3>
        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} className="mt-0.5 w-4 h-4 accent-green-600"/>
          <span className="text-sm text-gray-700">I confirm the data entered above is accurate and represents actual performance for the stated period and location.</span>
        </label>
        <div className="flex gap-3">
          <Button onClick={handleSubmit} disabled={!approved||submitting||filledMetrics.length===0} className="bg-green-600 hover:bg-green-700 text-white">{submitting?"Submitting...":"✓ Submit Performance Data"}</Button>
          <Button variant="outline" onClick={onBack}>← Back</Button>
        </div>
      </div>
    </div>
  );
}
