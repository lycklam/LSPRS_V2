import { useState, useEffect } from "react";
import { supabase, CAT_COLORS } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CAT_BG = [
  "bg-blue-100 text-blue-700", "bg-amber-100 text-amber-700",
  "bg-green-100 text-green-700", "bg-purple-100 text-purple-700",
  "bg-red-100 text-red-700", "bg-cyan-100 text-cyan-700",
];

// ── FIX: Metric relevance is now per supplier / country / location ────────────
// Selection hierarchy: Supplier → Country → Location
// Saving at location level stores location_id on the record.
// If no location selected, saves as supplier-level default (location_id = null).
// Location-level settings override supplier-level defaults at submission time.

export default function MetricRelevanceTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [relevance, setRelevance] = useState<Record<string, boolean>>({});
  const [selSupplier, setSelSupplier] = useState("");
  const [selCountry, setSelCountry] = useState("");
  const [selLocation, setSelLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Load reference data on mount
  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name,business_type").order("name"),
      supabase.from("categories").select("*").order("number"),
      supabase.from("metrics").select("*, categories(number,name)").order("number"),
    ]).then(([s, c, m]) => {
      setSuppliers(s.data || []);
      setCategories(c.data || []);
      setMetrics(m.data || []);
    });
  }, []);

  // Load countries when supplier changes
  useEffect(() => {
    if (!selSupplier) { setCountries([]); setLocations([]); setSelCountry(""); setSelLocation(""); return; }
    supabase.from("countries").select("id,country_name")
      .eq("supplier_id", selSupplier).order("country_name")
      .then(({ data }) => setCountries(data || []));
    setSelCountry(""); setSelLocation("");
  }, [selSupplier]);

  // Load locations when country changes
  useEffect(() => {
    if (!selCountry) { setLocations([]); setSelLocation(""); return; }
    supabase.from("locations").select("id,name")
      .eq("country_id", selCountry).eq("status", "active").order("name")
      .then(({ data }) => setLocations(data || []));
    setSelLocation("");
  }, [selCountry]);

  // Load relevance whenever supplier or location selection changes
  useEffect(() => {
    if (!selSupplier || !metrics.length) return;
    loadRelevance();
  }, [selSupplier, selLocation, metrics]);

  const loadRelevance = async () => {
    setLoading(true);
    // Start with all metrics relevant by default
    const rel: Record<string, boolean> = {};
    metrics.forEach(m => { rel[m.id] = true; });

    // Layer 1: supplier-level defaults (location_id IS NULL)
    const { data: supplierData } = await supabase.from("metric_relevance")
      .select("metric_id,is_relevant")
      .eq("supplier_id", selSupplier)
      .is("location_id", null);
    (supplierData || []).forEach(r => { rel[r.metric_id] = r.is_relevant; });

    // Layer 2: location-level overrides (if a location is selected)
    if (selLocation) {
      const { data: locationData } = await supabase.from("metric_relevance")
        .select("metric_id,is_relevant")
        .eq("supplier_id", selSupplier)
        .eq("location_id", selLocation);
      (locationData || []).forEach(r => { rel[r.metric_id] = r.is_relevant; });
    }

    setRelevance(rel);
    setLoading(false);
  };

  const toggle = (id: string) => setRelevance(prev => ({ ...prev, [id]: !prev[id] }));

  const saveRelevance = async () => {
    if (!selSupplier) return;
    setSaving(true);
    try {
      for (const [metric_id, is_relevant] of Object.entries(relevance)) {
        if (selLocation) {
          // Save at location level
          const { data: ex } = await supabase.from("metric_relevance").select("id")
            .eq("supplier_id", selSupplier)
            .eq("metric_id", metric_id)
            .eq("location_id", selLocation);
          if (ex?.length) {
            await supabase.from("metric_relevance").update({ is_relevant }).eq("id", ex[0].id);
          } else {
            await supabase.from("metric_relevance").insert({
              supplier_id: selSupplier, metric_id, is_relevant, location_id: selLocation,
            });
          }
        } else {
          // Save as supplier-level default (location_id = null)
          const { data: ex } = await supabase.from("metric_relevance").select("id")
            .eq("supplier_id", selSupplier)
            .eq("metric_id", metric_id)
            .is("location_id", null);
          if (ex?.length) {
            await supabase.from("metric_relevance").update({ is_relevant }).eq("id", ex[0].id);
          } else {
            await supabase.from("metric_relevance").insert({
              supplier_id: selSupplier, metric_id, is_relevant,
            });
          }
        }
      }
      toast({
        title: "Relevance settings saved",
        description: selLocation
          ? `Saved for this location. These override supplier-level defaults.`
          : `Saved as supplier-level defaults. Applied to all locations unless overridden.`,
      });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const selSup = suppliers.find(s => s.id === selSupplier);
  const selLoc = locations.find(l => l.id === selLocation);
  const metricsByCat = categories.map(cat => ({
    ...cat,
    metrics: metrics.filter(m => m.categories?.number === cat.number),
  }));
  const relevantCount = Object.values(relevance).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Selection Panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Metric Relevance</h3>
        <p className="text-sm text-gray-500 mb-4">
          Set which metrics apply per supplier location. Select a supplier to set defaults for all their locations,
          or drill down to a specific location to override.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Supplier *</Label>
            <Select value={selSupplier} onValueChange={setSelSupplier}>
              <SelectTrigger><SelectValue placeholder="— Select supplier —" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.business_type ? `(${s.business_type})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Country <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Select value={selCountry} onValueChange={setSelCountry} disabled={!selSupplier}>
              <SelectTrigger><SelectValue placeholder="— All countries —" /></SelectTrigger>
              <SelectContent>
                {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.country_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Location <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Select value={selLocation} onValueChange={setSelLocation} disabled={!selCountry}>
              <SelectTrigger><SelectValue placeholder="— Supplier default —" /></SelectTrigger>
              <SelectContent>
                {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {selSupplier && (
        loading ? (
          <div className="p-8 text-center text-gray-400">Loading metrics...</div>
        ) : (
          <>
            {/* Context banner */}
            <div className={`border rounded-lg px-4 py-3 text-sm ${selLocation ? "bg-purple-50 border-purple-200 text-purple-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
              {selLocation ? (
                <>
                  <strong>Location override mode</strong> — settings below apply only to <strong>{selLoc?.name}</strong>.
                  They override the supplier-level defaults for this location.
                </>
              ) : (
                <>
                  <strong>Supplier default mode</strong> — settings below apply to <strong>{selSup?.name}</strong> across all locations unless a location-specific override exists.
                  {selSup?.business_type === "B2B" && " B2C-only metrics are automatically excluded regardless."}
                  {selSup?.business_type === "B2C" && " B2B-only metrics are automatically excluded regardless."}
                </>
              )}
            </div>

            {/* Metric toggles by category */}
            {metricsByCat.map((cat, ci) => (
              <div key={cat.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${CAT_BG[ci % CAT_BG.length]}`}>
                    {cat.number}
                  </span>
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
                            {m.applies_b2b && !m.applies_b2c && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-semibold">B2B only</span>
                            )}
                            {!m.applies_b2b && m.applies_b2c && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-semibold">B2C only</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {m.input_type} · {m.reported_by} · {m.max_points} pts
                          </div>
                        </div>
                        <button
                          onClick={() => toggle(m.id)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isRelevant ? "bg-blue-600" : "bg-gray-200"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${isRelevant ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                        <span className="text-xs font-semibold w-16 text-right">
                          {isRelevant
                            ? <span className="text-blue-600">Relevant</span>
                            : <span className="text-gray-400">N/A</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-4">
              <Button onClick={saveRelevance} disabled={saving}>
                {saving ? "Saving..." : selLocation ? "✓ Save Location Overrides" : "✓ Save Supplier Defaults"}
              </Button>
              <span className="text-xs text-gray-400">
                {relevantCount} of {metrics.length} metrics marked relevant
              </span>
            </div>
          </>
        )
      )}
    </div>
  );
}
