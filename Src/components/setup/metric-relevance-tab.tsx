import { useState, useEffect } from "react";
import { supabase, CAT_COLORS } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const SEL = `height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;font-family:'DM Sans',sans-serif;width:100%;appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center`;

interface LocationCol {
  location_id: string;
  location_name: string;
  country_name: string;
}

// relevanceMap[metric_id][location_id] = true/false
type RelevanceMap = Record<string, Record<string, boolean>>;

export default function MetricRelevanceTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [locationCols, setLocationCols] = useState<LocationCol[]>([]);
  const [relevanceMap, setRelevanceMap] = useState<RelevanceMap>({});
  const [selSupplier, setSelSupplier] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

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

  useEffect(() => {
    if (!selSupplier || !metrics.length) return;
    loadMatrix();
  }, [selSupplier, metrics]);

  const loadMatrix = async () => {
    setLoading(true);

    // Get all locations for this supplier (with country name)
    const { data: locs } = await supabase
      .from("locations")
      .select("id, name, countries(country_name)")
      .eq("supplier_id", selSupplier)
      .eq("status", "active")
      .order("name");

    const cols: LocationCol[] = (locs || []).map((l: any) => ({
      location_id: l.id,
      location_name: l.name,
      country_name: l.countries?.country_name || "—",
    }));
    setLocationCols(cols);

    // Get all relevance records for this supplier
    const { data: relRows } = await supabase
      .from("metric_relevance")
      .select("metric_id, location_id, is_relevant")
      .eq("supplier_id", selSupplier);

    // Build map: metric_id → { location_id → bool }
    // Default: all true
    const map: RelevanceMap = {};
    metrics.forEach(m => {
      map[m.id] = {};
      cols.forEach(col => { map[m.id][col.location_id] = true; });
    });

    // Apply supplier-level defaults (location_id IS NULL)
    const supplierDefaults = (relRows || []).filter(r => !r.location_id);
    supplierDefaults.forEach(r => {
      if (map[r.metric_id]) {
        cols.forEach(col => { map[r.metric_id][col.location_id] = r.is_relevant; });
      }
    });

    // Apply location-level overrides
    const locationOverrides = (relRows || []).filter(r => !!r.location_id);
    locationOverrides.forEach(r => {
      if (map[r.metric_id] && r.location_id) {
        map[r.metric_id][r.location_id] = r.is_relevant;
      }
    });

    setRelevanceMap(map);
    setLoading(false);
  };

  const toggle = (metricId: string, locationId: string) => {
    setRelevanceMap(prev => ({
      ...prev,
      [metricId]: { ...prev[metricId], [locationId]: !prev[metricId]?.[locationId] },
    }));
  };

  const setAllForMetric = (metricId: string, val: boolean) => {
    setRelevanceMap(prev => {
      const updated = { ...prev[metricId] };
      locationCols.forEach(col => { updated[col.location_id] = val; });
      return { ...prev, [metricId]: updated };
    });
  };

  const setAllForLocation = (locationId: string, val: boolean) => {
    setRelevanceMap(prev => {
      const updated = { ...prev };
      metrics.forEach(m => {
        if (updated[m.id]) updated[m.id] = { ...updated[m.id], [locationId]: val };
      });
      return updated;
    });
  };

  const saveAll = async () => {
    if (!selSupplier) return;
    setSaving(true);
    try {
      // Save location-level records for each metric × location
      for (const m of metrics) {
        for (const col of locationCols) {
          const is_relevant = relevanceMap[m.id]?.[col.location_id] ?? true;
          const { data: ex } = await supabase.from("metric_relevance").select("id")
            .eq("supplier_id", selSupplier).eq("metric_id", m.id).eq("location_id", col.location_id);
          if (ex?.length) {
            await supabase.from("metric_relevance").update({ is_relevant }).eq("id", ex[0].id);
          } else {
            await supabase.from("metric_relevance").insert({ supplier_id: selSupplier, metric_id: m.id, location_id: col.location_id, is_relevant });
          }
        }
      }
      toast({ title: "Relevance matrix saved", description: `${metrics.length * locationCols.length} settings updated.` });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const selSup = suppliers.find(s => s.id === selSupplier);
  const metricsByCat = categories.map(cat => ({
    ...cat,
    metrics: metrics.filter(m => m.categories?.number === cat.number),
  })).filter(c => c.metrics.length > 0);

  // Group location columns by country
  const countriesInCols = [...new Set(locationCols.map(c => c.country_name))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .mr2-hdr-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .mr2-hdr-card h3{font-size:15px;font-weight:700;color:#0F1B2D;margin:0 0 4px}
        .mr2-hdr-card p{font-size:13px;color:#64748B;margin:0 0 20px}
        .mr2-sel-row{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}
        .mr2-sel-field{display:flex;flex-direction:column;gap:5px;min-width:240px}
        .mr2-sel-field label{font-size:12px;font-weight:700;color:#475569;letter-spacing:0.02em;text-transform:uppercase}
        .mr2-matrix-wrap{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
        .mr2-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
        .mr2-table{border-collapse:collapse;min-width:100%}

        /* Sticky left columns */
        .mr2-table .col-cat{position:sticky;left:0;z-index:3;background:#F8FAFC;min-width:130px;max-width:130px;width:130px}
        .mr2-table .col-metric{position:sticky;left:130px;z-index:3;background:#fff;min-width:220px;max-width:220px;width:220px;border-right:2px solid #E2E8F0}

        /* Header rows */
        .mr2-table thead tr.country-row th{background:#0F1B2D;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:9px 12px;text-align:center;border-right:1px solid rgba(255,255,255,0.1)}
        .mr2-table thead tr.country-row th.sticky-head{position:sticky;left:0;z-index:4;background:#0F1B2D}
        .mr2-table thead tr.country-row th.sticky-head2{position:sticky;left:130px;z-index:4;background:#0F1B2D;border-right:2px solid rgba(255,255,255,0.2)}
        .mr2-table thead tr.loc-row th{background:#1A2E4A;color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;padding:8px 10px;text-align:center;white-space:nowrap;border-right:1px solid rgba(255,255,255,0.08);max-width:90px}
        .mr2-table thead tr.loc-row th.sticky-head{position:sticky;left:0;z-index:4;background:#1A2E4A;text-align:left;padding-left:16px}
        .mr2-table thead tr.loc-row th.sticky-head2{position:sticky;left:130px;z-index:4;background:#1A2E4A;border-right:2px solid rgba(255,255,255,0.15);text-align:left;padding-left:14px}
        .mr2-table thead tr.loc-row th .loc-all-btns{display:flex;gap:4px;justify-content:center;margin-top:4px}
        .mr2-table thead tr.loc-row th .loc-all-btn{font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif}
        .mr2-table thead tr.loc-row th .loc-all-btn.on{background:#10B981;color:#fff}
        .mr2-table thead tr.loc-row th .loc-all-btn.off{background:#EF4444;color:#fff}

        /* Category header rows */
        .mr2-table tr.cat-row td{background:#F8FAFC;padding:8px 16px;border-top:2px solid #E2E8F0;border-bottom:1px solid #E8EEF4}
        .mr2-table tr.cat-row td.cat-label{font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.06em;display:flex;align-items:center;gap:8px}
        .mr2-table tr.cat-row td.sticky-cat{position:sticky;left:0;z-index:2;background:#F8FAFC}
        .mr2-table tr.cat-row td.sticky-cat2{position:sticky;left:130px;z-index:2;background:#F8FAFC;border-right:2px solid #E2E8F0}

        /* Metric rows */
        .mr2-table tr.metric-row:hover td{background:#FAFCFF}
        .mr2-table tr.metric-row td{border-bottom:1px solid #F1F5F9;padding:0;vertical-align:middle}
        .mr2-table tr.metric-row:last-child td{border-bottom:none}
        .mr2-table tr.metric-row td.td-cat{position:sticky;left:0;z-index:2;background:#FAFBFC;padding:12px 16px;border-right:1px solid #F1F5F9}
        .mr2-table tr.metric-row td.td-metric{position:sticky;left:130px;z-index:2;background:#fff;padding:12px 14px;border-right:2px solid #E2E8F0}
        .mr2-table tr.metric-row:hover td.td-cat,.mr2-table tr.metric-row:hover td.td-metric{background:#F8FBFF}
        .mr2-metric-name{font-size:13px;font-weight:600;color:#1E293B;line-height:1.3}
        .mr2-metric-sub{font-size:11px;color:#94A3B8;margin-top:2px}
        .mr2-metric-tag{display:inline-flex;padding:1px 6px;border-radius:3px;font-size:9.5px;font-weight:700;margin-left:4px;vertical-align:middle}
        .mr2-all-row-btns{display:flex;gap:4px;margin-top:4px}
        .mr2-all-row-btn{font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif}
        .mr2-all-row-btn.on{background:#DCFCE7;color:#15803D}
        .mr2-all-row-btn.off{background:#FEE2E2;color:#B91C1C}

        /* Toggle cells */
        .mr2-table tr.metric-row td.td-toggle{text-align:center;padding:10px 8px;border-right:1px solid #F8FAFC;min-width:80px}
        .mr2-toggle-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
        .mr2-tog{position:relative;display:inline-flex;height:22px;width:40px;cursor:pointer;border-radius:20px;border:none;transition:background 0.2s;outline:none;flex-shrink:0}
        .mr2-tog-knob{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:transform 0.15s}
        .mr2-tog-lbl{font-size:9px;font-weight:700}

        .mr2-footer{padding:16px 20px;border-top:1px solid #F1F5F9;background:#FAFBFC;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .mr2-save-btn{height:38px;padding:0 20px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
        .mr2-save-btn:hover{background:#1D4ED8}
        .mr2-save-btn:disabled{background:#93C5FD;cursor:not-allowed}
        .mr2-save-note{font-size:12.5px;color:#64748B}
        .mr2-empty{padding:48px 20px;text-align:center;color:#94A3B8;font-size:13.5px}
        .mr2-banner{border-radius:10px;padding:11px 16px;font-size:13px}
      `}</style>

      {/* Supplier selector */}
      <div className="mr2-hdr-card">
        <h3>Metric Relevance Matrix</h3>
        <p>Toggle which metrics apply to each location. Each column is a location — rows are metrics grouped by category.</p>
        <div className="mr2-sel-row">
          <div className="mr2-sel-field">
            <label>Supplier</label>
            <select style={{ cssText: SEL } as any} value={selSupplier} onChange={e => setSelSupplier(e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.business_type ? ` (${s.business_type})` : ""}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selSupplier && (
        loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>Loading matrix…</div>
        ) : locationCols.length === 0 ? (
          <div className="mr2-matrix-wrap">
            <div className="mr2-empty">No active locations found for {selSup?.name}. Add locations in the Locations tab first.</div>
          </div>
        ) : (
          <>
            {selSup && (
              <div className="mr2-banner" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8" }}>
                <strong>{selSup.name}</strong> · {locationCols.length} location{locationCols.length !== 1 ? "s" : ""} · {metrics.length} metrics
                {selSup.business_type === "B2B" && " · B2C-only metrics will be auto-excluded at submission time"}
                {selSup.business_type === "B2C" && " · B2B-only metrics will be auto-excluded at submission time"}
              </div>
            )}

            <div className="mr2-matrix-wrap">
              <div className="mr2-scroll">
                <table className="mr2-table">
                  <thead>
                    {/* Row 1: Country headers (spanning their locations) */}
                    <tr className="country-row">
                      <th className="sticky-head col-cat">Category</th>
                      <th className="sticky-head2 col-metric">Metric</th>
                      {countriesInCols.map(country => {
                        const colsForCountry = locationCols.filter(c => c.country_name === country);
                        return (
                          <th key={country} colSpan={colsForCountry.length} style={{ borderRight: "2px solid rgba(255,255,255,0.15)" }}>
                            {country}
                          </th>
                        );
                      })}
                    </tr>
                    {/* Row 2: Location headers */}
                    <tr className="loc-row">
                      <th className="sticky-head">All on/off</th>
                      <th className="sticky-head2">–</th>
                      {locationCols.map((col, ci) => {
                        const isLastInCountry = ci === locationCols.length - 1 || locationCols[ci + 1].country_name !== col.country_name;
                        return (
                          <th key={col.location_id} style={{ borderRight: isLastInCountry ? "2px solid rgba(255,255,255,0.15)" : undefined, maxWidth: 90 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{col.location_name}</div>
                            <div className="loc-all-btns">
                              <button className="loc-all-btn on" onClick={() => setAllForLocation(col.location_id, true)}>All ✓</button>
                              <button className="loc-all-btn off" onClick={() => setAllForLocation(col.location_id, false)}>All ✗</button>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {metricsByCat.map((cat, ci) => (
                      <>
                        {/* Category header row */}
                        <tr key={`cat-${cat.id}`} className="cat-row">
                          <td className="cat-label sticky-cat" colSpan={1}>
                            <span style={{ width: 20, height: 20, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, background: CAT_COLORS[ci] + "22", color: CAT_COLORS[ci] }}>{cat.number}</span>
                            {cat.name}
                          </td>
                          <td className="sticky-cat2" style={{ padding: "8px 14px", fontSize: 11, color: "#94A3B8" }}>{cat.weight_pct}% · {cat.max_points} pts</td>
                          {locationCols.map(col => <td key={col.location_id} style={{ background: "#F8FAFC", borderRight: "1px solid #F1F5F9" }} />)}
                        </tr>

                        {/* Metric rows */}
                        {cat.metrics.map((m: any) => (
                          <tr key={m.id} className="metric-row">
                            <td className="td-cat">{/* empty — category shown in cat-row */}</td>
                            <td className="td-metric">
                              <div className="mr2-metric-name">
                                {m.name}
                                {m.applies_b2b && !m.applies_b2c && <span className="mr2-metric-tag" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>B2B</span>}
                                {!m.applies_b2b && m.applies_b2c && <span className="mr2-metric-tag" style={{ background: "#DCFCE7", color: "#15803D" }}>B2C</span>}
                              </div>
                              <div className="mr2-metric-sub">{m.input_type} · {m.reported_by} · {m.max_points} pts</div>
                              <div className="mr2-all-row-btns">
                                <button className="mr2-all-row-btn on" onClick={() => setAllForMetric(m.id, true)}>All on</button>
                                <button className="mr2-all-row-btn off" onClick={() => setAllForMetric(m.id, false)}>All off</button>
                              </div>
                            </td>
                            {locationCols.map((col, ci) => {
                              const isOn = relevanceMap[m.id]?.[col.location_id] !== false;
                              const isLastInCountry = ci === locationCols.length - 1 || locationCols[ci + 1].country_name !== col.country_name;
                              return (
                                <td key={col.location_id} className="td-toggle" style={{ borderRight: isLastInCountry ? "2px solid #E2E8F0" : "1px solid #F8FAFC" }}>
                                  <div className="mr2-toggle-wrap">
                                    <button className="mr2-tog" style={{ background: isOn ? "#2563EB" : "#CBD5E1" }} onClick={() => toggle(m.id, col.location_id)}>
                                      <span className="mr2-tog-knob" style={{ transform: isOn ? "translateX(18px)" : "translateX(3px)" }} />
                                    </button>
                                    <span className="mr2-tog-lbl" style={{ color: isOn ? "#2563EB" : "#94A3B8" }}>{isOn ? "On" : "Off"}</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mr2-footer">
                <div>
                  <button className="mr2-save-btn" onClick={saveAll} disabled={saving}>
                    {saving ? "Saving…" : "✓ Save All Settings"}
                  </button>
                </div>
                <div className="mr2-save-note">
                  {metrics.length} metrics × {locationCols.length} locations = {metrics.length * locationCols.length} settings
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
