import { useState, useEffect } from "react";
import { supabase, CAT_COLORS } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CAT_BG = ["bg-blue-100 text-blue-700","bg-amber-100 text-amber-700","bg-green-100 text-green-700","bg-purple-100 text-purple-700","bg-red-100 text-red-700","bg-cyan-100 text-cyan-700"];

export default function MetricRelevanceTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [relevance, setRelevance] = useState<Record<string, boolean>>({});
  const [selSupplier, setSelSupplier] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name,business_type").order("name"),
      supabase.from("categories").select("*").order("number"),
      supabase.from("metrics").select("*, categories(number,name)").order("number"),
    ]).then(([s, c, m]) => { setSuppliers(s.data || []); setCategories(c.data || []); setMetrics(m.data || []); });
  }, []);

  useEffect(() => {
    if (!selSupplier || !metrics.length) return;
    setLoading(true);
    supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id", selSupplier)
      .then(({ data }) => {
        const rel: Record<string, boolean> = {};
        metrics.forEach(m => { rel[m.id] = true; });
        (data || []).forEach(r => { rel[r.metric_id] = r.is_relevant; });
        setRelevance(rel);
        setLoading(false);
      });
  }, [selSupplier, metrics]);

  const toggle = (id: string) => setRelevance(prev => ({ ...prev, [id]: !prev[id] }));

  const saveRelevance = async () => {
    if (!selSupplier) return;
    setSaving(true);
    try {
      for (const [metric_id, is_relevant] of Object.entries(relevance)) {
        const { data: ex } = await supabase.from("metric_relevance").select("id").eq("supplier_id", selSupplier).eq("metric_id", metric_id);
        if (ex?.length) await supabase.from("metric_relevance").update({ is_relevant }).eq("id", ex[0].id);
        else await supabase.from("metric_relevance").insert({ supplier_id: selSupplier, metric_id, is_relevant });
      }
      toast({ title: "Relevance settings saved" });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const selSup = suppliers.find(s => s.id === selSupplier);
  const metricsByCat = categories.map(cat => ({ ...cat, metrics: metrics.filter(m => m.categories?.number === cat.number) }));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Metric Relevance per Supplier</h3>
        <p className="text-sm text-gray-500 mb-4">Set which metrics apply to each supplier. Only relevant metrics appear in monthly submissions.</p>
        <div className="max-w-sm"><Label>Select Supplier</Label>
          <Select value={selSupplier} onValueChange={setSelSupplier}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="— Select supplier —" /></SelectTrigger>
            <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name} {s.business_type ? `(${s.business_type})` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {selSupplier && (loading ? <div className="p-8 text-center text-gray-400">Loading metrics...</div> : (
        <>
          {selSup && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <strong>{selSup.name}</strong> is a <strong>{selSup.business_type || "unknown type"}</strong> supplier.
              {selSup.business_type === "B2B" && " Metrics flagged B2C only are automatically excluded."}
              {selSup.business_type === "B2C" && " Metrics flagged B2B only are automatically excluded."}
            </div>
          )}
          {metricsByCat.map((cat, ci) => (
            <div key={cat.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${CAT_BG[ci % CAT_BG.length]}`}>{cat.number}</span>
                <span className="font-semibold text-sm text-gray-800">{cat.name}</span>
                <span className="ml-auto text-xs text-gray-400">{cat.weight_pct}% · {cat.max_points} pts</span>
              </div>
              <div className="divide-y divide-gray-50">
                {cat.metrics.map(m => {
                  const isRelevant = relevance[m.id] !== false;
                  return (
                    <div key={m.id} className={`px-5 py-3 flex items-center justify-between gap-4 ${!isRelevant ? "opacity-40" : ""}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{m.name}</span>
                          {m.applies_b2b && !m.applies_b2c && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-semibold">B2B only</span>}
                          {!m.applies_b2b && m.applies_b2c && <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-semibold">B2C only</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{m.input_type} · {m.reported_by} · {m.max_points} pts</div>
                      </div>
                      <button onClick={() => toggle(m.id)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isRelevant ? "bg-blue-600" : "bg-gray-200"}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${isRelevant ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                      <span className="text-xs font-semibold w-16 text-right">
                        {isRelevant ? <span className="text-blue-600">Relevant</span> : <span className="text-gray-400">N/A</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-4">
            <Button onClick={saveRelevance} disabled={saving}>{saving ? "Saving..." : "✓ Save Relevance Settings"}</Button>
            <span className="text-xs text-gray-400">{Object.values(relevance).filter(Boolean).length} of {metrics.length} metrics marked relevant</span>
          </div>
        </>
      ))}
    </div>
  );
}
