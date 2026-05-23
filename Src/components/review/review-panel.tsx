import { useState, useEffect } from "react";
import { supabase, SHORT_MONTHS, deleteSubmissionCascade } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const STATUS_STYLES: Record<string,string> = {
  draft:"bg-gray-100 text-gray-600", submitted:"bg-amber-100 text-amber-700",
  flagged:"bg-red-100 text-red-700", approved:"bg-green-100 text-green-700",
};

export default function ReviewPanel() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("submissions").select("*,suppliers(name,business_type),locations(name),countries(country_name)").order("created_at",{ascending:false}).limit(100),
      supabase.from("metrics").select("*").order("number"),
    ]).then(([s,m])=>{ setSubmissions(s.data||[]); setMetrics(m.data||[]); setLoading(false); });
  }, []);

  const loadResponses = async (sub:any) => {
    setSelected(sub);
    const {data}=await supabase.from("responses").select("*").eq("submission_id",sub.id);
    setResponses(data||[]);
  };

  const updateStatus = async (id:string, status:string) => {
    const update:any={status};
    if(status==="approved") update.approved_at=new Date().toISOString();
    const {error}=await supabase.from("submissions").update(update).eq("id",id);
    if(error){toast({title:"Update failed",description:error.message,variant:"destructive"});return;}
    setSubmissions(prev=>prev.map(s=>s.id===id?{...s,status}:s));
    if(selected?.id===id) setSelected((prev:any)=>({...prev,status}));
    toast({title:`Submission ${status}`});
  };

  const confirmDelete = async () => {
    if(!deleteTarget)return;
    setSaving(true);
    try{
      await deleteSubmissionCascade(deleteTarget.id);
      setSubmissions(prev=>prev.filter(s=>s.id!==deleteTarget.id));
      if(selected?.id===deleteTarget.id){setSelected(null);setResponses([]);}
      toast({title:"Submission deleted"});
      setDeleteTarget(null);
    }catch(e:any){toast({title:"Delete failed",description:e.message,variant:"destructive"});}
    setSaving(false);
  };

  const getMetric=(id:string)=>metrics.find(m=>m.id===id);

  if(loading) return <div className="p-12 text-center text-gray-400">Loading submissions...</div>;

  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-semibold text-gray-900">Review & Approve</h2><p className="text-sm text-gray-500 mt-1">Review monthly submissions and approve or flag them.</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">Submissions ({submissions.length})</div>
          {submissions.length===0?(
            <div className="p-8 text-center text-gray-400"><div className="text-3xl mb-2">📭</div><div>No submissions yet.</div></div>
          ):(
            <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
              {submissions.map(s=>(
                <div key={s.id} onClick={()=>loadResponses(s)} className={`px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${selected?.id===s.id?"bg-blue-50":""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-gray-900 truncate">{s.suppliers?.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{s.locations?.name} · {s.countries?.country_name} · {SHORT_MONTHS[s.reporting_month]} {s.reporting_year}</div>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[s.status]||STATUS_STYLES.draft}`}>{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {!selected?(
            <div className="p-8 text-center text-gray-400"><div className="text-3xl mb-2">👈</div><div>Select a submission to review</div></div>
          ):(
            <div className="flex flex-col h-full">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{selected.suppliers?.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{selected.locations?.name} · {selected.countries?.country_name} · {SHORT_MONTHS[selected.reporting_month]} {selected.reporting_year}</div>
                  </div>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[selected.status]||STATUS_STYLES.draft}`}>{selected.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <div><span className="text-gray-400">Submitted by</span><div className="font-medium text-gray-700">{selected.submitted_by||"—"}</div></div>
                  <div><span className="text-gray-400">Reviewed by</span><div className="font-medium text-gray-700">{selected.reviewed_by||"—"}</div></div>
                  <div><span className="text-gray-400">Date</span><div className="font-medium text-gray-700">{selected.submitted_at?new Date(selected.submitted_at).toLocaleDateString():"—"}</div></div>
                  <div><span className="text-gray-400">Responses</span><div className="font-medium text-gray-700">{responses.length} recorded</div></div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto max-h-64">
                {responses.length===0?(
                  <div className="p-6 text-center text-gray-400 text-sm">No responses recorded.</div>
                ):(
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left px-4 py-2 text-gray-500 font-semibold uppercase">Metric</th><th className="text-right px-4 py-2 text-gray-500 font-semibold uppercase">Value</th><th className="text-right px-4 py-2 text-gray-500 font-semibold uppercase">Pts</th></tr></thead>
                    <tbody>{responses.map(r=>{
                      const m=getMetric(r.metric_id);
                      const val=r.value_likert??r.value_numeric;
                      return (
                        <tr key={r.id} className={`border-b border-gray-50 ${r.is_flagged?"bg-red-50":""}`}>
                          <td className="px-4 py-2 text-gray-800">{m?.name||"—"}</td>
                          <td className="px-4 py-2 text-right font-medium">{val??"—"}{m?.input_type==="percent"?"%":""}{m?.input_type==="likert"?"/5":""}{r.is_flagged&&<span className="ml-1 text-red-500">⚠</span>}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${r.points_earned===0?"text-red-500":"text-green-600"}`}>{r.points_earned??"—"}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
              </div>

              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                <div className="flex flex-wrap gap-2">
                  {selected.status!=="approved"&&<Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={()=>updateStatus(selected.id,"approved")}>✓ Approve</Button>}
                  {selected.status!=="flagged"&&<Button size="sm" variant="destructive" onClick={()=>updateStatus(selected.id,"flagged")}>⚠ Flag</Button>}
                  {selected.status!=="submitted"&&<Button size="sm" variant="outline" onClick={()=>updateStatus(selected.id,"submitted")}>↩ Reset</Button>}
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 ml-auto" onClick={()=>setDeleteTarget(selected)}>Delete</Button>
                </div>
                {selected.status==="approved"&&<p className="text-xs text-green-600 mt-2">✓ This submission has been approved.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={open=>!open&&setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the submission for <strong>{deleteTarget?.suppliers?.name}</strong> — {deleteTarget&&`${SHORT_MONTHS[deleteTarget.reporting_month]} ${deleteTarget.reporting_year}`}. All responses, scores and flags will also be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Yes, delete submission</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
