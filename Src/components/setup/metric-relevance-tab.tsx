import { useState, useEffect } from "react";
import { supabase, CAT_COLORS } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

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

  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name,business_type").order("name"),
      supabase.from("categories").select("*").order("number"),
      supabase.from("metrics").select("*, categories(number,name)").order("number"),
    ]).then(([s, c, m]) => { setSuppliers(s.data || []); setCategories(c.data || []); setMetrics(m.data || []); });
  }, []);

  useEffect(() => {
    if (!selSupplier) { setCountries([]); setLocations([]); setSelCountry(""); setSelLocation(""); return; }
    supabase.from("countries").select("id,country_name").eq("supplier_id", selSupplier).order("country_name")
      .then(({ data }) => setCountries(data || []));
    setSelCountry(""); setSelLocation("");
  }, [selSupplier]);

  useEffect(() => {
    if (!selCountry) { setLocations([]); setSelLocation(""); return; }
    supabase.from("locations").select("id,name").eq("country_id", selCountry).eq("status", "active").order("name")
      .then(({ data }) => setLocations(data || []));
    setSelLocation("");
  }, [selCountry]);

  useEffect(() => {
    if (!selSupplier || !metrics.length) return;
    loadRelevance();
  }, [selSupplier, selLocation, metrics]);

  const loadRelevance = async () => {
    setLoading(true);
    const rel: Record<string, boolean> = {};
    metrics.forEach(m => { rel[m.id] = true; });
    const { data: sd } = await supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id", selSupplier).is("location_id", null);
    (sd || []).forEach(r => { rel[r.metric_id] = r.is_relevant; });
    if (selLocation) {
      const { data: ld } = await supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id", selSupplier).eq("location_id", selLocation);
      (ld || []).forEach(r => { rel[r.metric_id] = r.is_relevant; });
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
          const { data: ex } = await supabase.from("metric_relevance").select("id").eq("supplier_id", selSupplier).eq("metric_id", metric_id).eq("location_id", selLocation);
          if (ex?.length) await supabase.from("metric_relevance").update({ is_relevant }).eq("id", ex[0].id);
          else await supabase.from("metric_relevance").insert({ supplier_id: selSupplier, metric_id, is_relevant, location_id: selLocation });
        } else {
          const { data: ex } = await supabase.from("metric_relevance").select("id").eq("supplier_id", selSupplier).eq("metric_id", metric_id).is("location_id", null);
          if (ex?.length) await supabase.from("metric_relevance").update({ is_relevant }).eq("id", ex[0].id);
          else await supabase.from("metric_relevance").insert({ supplier_id: selSupplier, metric_id, is_relevant });
        }
      }
      toast({ title: "Relevance settings saved", description: selLocation ? "Location override saved." : "Supplier defaults saved." });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const selSup = suppliers.find(s => s.id === selSupplier);
  const selLoc = locations.find(l => l.id === selLocation);
  const metricsByCat = categories.map(cat => ({ ...cat, metrics: metrics.filter(m => m.categories?.number === cat.number) }));
  const relevantCount = Object.values(relevance).filter(Boolean).length;

  const SEL_STYLE = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;transition:border-color 0.15s,box-shadow 0.15s;font-family:'DM Sans',sans-serif;width:100%;appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .mr-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .mr-card h3{font-size:15px;font-weight:700;color:#0F1B2D;margin:0 0 4px}
        .mr-card p{font-size:13px;color:#64748B;margin:0 0 20px}
        .mr-sel-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
        @media(max-width:700px){.mr-sel-grid{grid-template-columns:1fr}}
        .mr-fd{display:flex;flex-direction:column;gap:5px}
        .mr-fd label{font-size:12px;font-weight:700;color:#475569;letter-spacing:0.02em;text-transform:uppercase}
        .mr-banner{border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.5}
        .mr-cat{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .mr-cat-hdr{padding:13px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:10px;background:#FAFBFC}
        .mr-cat-num{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0}
        .mr-cat-name{font-size:13.5px;font-weight:700;color:#0F1B2D}
        .mr-cat-meta{margin-left:auto;font-size:11.5px;color:#94A3B8}
        .mr-metric{padding:13px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #F8FAFC;transition:background 0.1s}
        .mr-metric:last-child{border-bottom:none}
        .mr-metric:hover{background:#FAFCFF}
        .mr-metric.off{opacity:0.4}
        .mr-metric-name{font-size:13.5px;font-weight:500;color:#1E293B;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .mr-metric-sub{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .mr-tag{display:inline-flex;padding:2px 8px;border-radius:4px;font-size:10.5px;font-weight:700}
        .mr-toggle{position:relative;display:inline-flex;height:22px;width:40px;flex-shrink:0;cursor:pointer;border-radius:20px;border:none;transition:background 0.2s;outline:none}
        .mr-toggle-knob{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:transform 0.2s}
        .mr-status{font-size:12px;font-weight:700;width:60px;text-align:right}
        .mr-footer{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
        .mr-save-btn{height:38px;padding:0 20px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .mr-save-btn:hover{background:#1D4ED8}
        .mr-save-btn:disabled{background:#93C5FD;cursor:not-allowed}
        .mr-save-note{font-size:12.5px;color:#64748B}
      `}</style>

      {/* Selection */}
      <div className="mr-card">
        <h3>Metric Relevance</h3>
        <p>Set which metrics apply per supplier and location. Select a supplier for defaults, or drill down to a specific location to override.</p>
        <div className="mr-sel-grid">
          <div className="mr-fd">
            <label>Supplier *</label>
            <select style={{ cssText: SEL_STYLE } as any} value={selSupplier} onChange={e => setSelSupplier(e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.business_type ? ` (${s.business_type})` : ""}</option>)}
            </select>
          </div>
          <div className="mr-fd">
            <label>Country <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
            <select style={{ cssText: SEL_STYLE } as any} value={selCountry} disabled={!selSupplier} onChange={e => setSelCountry(e.target.value)}>
              <option value="">— All countries —</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.country_name}</option>)}
            </select>
          </div>
          <div className="mr-fd">
            <label>Location <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
            <select style={{ cssText: SEL_STYLE } as any} value={selLocation} disabled={!selCountry} onChange={e => setSelLocation(e.target.value)}>
              <option value="">— Supplier default —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selSupplier && (loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading metrics…</div>
      ) : (
        <>
          <div className="mr-banner" style={{ background: selLocation ? "#FAF5FF" : "#EFF6FF", border: `1px solid ${selLocation ? "#E9D5FF" : "#BFDBFE"}`, color: selLocation ? "#6B21A8" : "#1D4ED8" }}>
            {selLocation
              ? <><strong>Location override:</strong> Settings below apply only to <strong>{selLoc?.name}</strong> and override supplier defaults.</>
              : <><strong>Supplier defaults:</strong> Settings below apply to all <strong>{selSup?.name}</strong> locations unless a location override exists. {selSup?.business_type === "B2B" ? "B2C-only metrics excluded automatically." : selSup?.business_type === "B2C" ? "B2B-only metrics excluded automatically." : ""}</>
            }
          </div>

          {metricsByCat.map((cat, ci) => (
            <div key={cat.id} className="mr-cat">
              <div className="mr-cat-hdr">
                <span className="mr-cat-num" style={{ background: CAT_COLORS[ci] + "22", color: CAT_COLORS[ci] }}>{cat.number}</span>
                <span className="mr-cat-name">{cat.name}</span>
                <span className="mr-cat-meta">{cat.weight_pct}% · {cat.max_points} pts</span>
              </div>
              {cat.metrics.map((m: any) => {
                const isRelevant = relevance[m.id] !== false;
                return (
                  <div key={m.id} className={`mr-metric ${!isRelevant ? "off" : ""}`}>
                    <div style={{ flex: 1 }}>
                      <div className="mr-metric-name">
                        {m.name}
                        {m.applies_b2b && !m.applies_b2c && <span className="mr-tag" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>B2B</span>}
                        {!m.applies_b2b && m.applies_b2c && <span className="mr-tag" style={{ background: "#DCFCE7", color: "#15803D" }}>B2C</span>}
                      </div>
                      <div className="mr-metric-sub">{m.input_type} · {m.reported_by} · {m.max_points} pts</div>
                    </div>
                    <button
                      className="mr-toggle"
                      style={{ background: isRelevant ? "#2563EB" : "#CBD5E1" }}
                      onClick={() => toggle(m.id)}
                    >
                      <span className="mr-toggle-knob" style={{ transform: isRelevant ? "translateX(18px)" : "translateX(3px)" }} />
                    </button>
                    <span className="mr-status" style={{ color: isRelevant ? "#2563EB" : "#94A3B8" }}>
                      {isRelevant ? "Active" : "N/A"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="mr-footer">
            <button className="mr-save-btn" onClick={saveRelevance} disabled={saving}>
              {saving ? "Saving…" : selLocation ? "✓ Save Location Overrides" : "✓ Save Supplier Defaults"}
            </button>
            <span className="mr-save-note">{relevantCount} of {metrics.length} metrics active</span>
          </div>
        </>
      ))}
    </div>
  );
}
