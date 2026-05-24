import { useState, useEffect } from "react";
import { supabase, FULL_MONTHS, CAT_COLORS } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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

  const now = new Date();
  const [form, setForm] = useState({
    supplier_id: "", country_id: "", location_id: "",
    month: now.getMonth() + 1, year: now.getFullYear(), reviewer: "",
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
      supabase.from("countries").select("id,country_name")
        .eq("supplier_id", form.supplier_id).order("country_name")
        .then(({ data }) => setCountries(data || []));
      setForm(f => ({ ...f, country_id: "", location_id: "" }));
    }
  }, [form.supplier_id]);

  useEffect(() => {
    if (form.country_id) {
      supabase.from("locations").select("id,name")
        .eq("country_id", form.country_id).eq("status", "active").order("name")
        .then(({ data }) => setLocations(data || []));
      setForm(f => ({ ...f, location_id: "" }));
    }
  }, [form.country_id]);

  // Load previous month values for carry-forward
  useEffect(() => {
    if (!form.location_id) return;
    const pm = form.month === 1 ? 12 : form.month - 1;
    const py = form.month === 1 ? form.year - 1 : form.year;
    supabase.from("submissions").select("id")
      .eq("location_id", form.location_id)
      .eq("reporting_month", pm)
      .eq("reporting_year", py)
      .then(({ data }) => {
        if (!data?.length) return;
        supabase.from("responses").select("metric_id,value_likert")
          .eq("submission_id", data[0].id)
          .then(({ data: rs }) => {
            const pv: Record<string, number> = {};
            (rs || []).forEach(r => { if (r.value_likert) pv[r.metric_id] = r.value_likert; });
            setPrevValues(pv);
            setValues(pv);
          });
      });
  }, [form.location_id, form.month, form.year]);

  const getAnchors = (id: string) => anchors.filter(a => a.metric_id === id).sort((a, b) => a.score - b.score);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      let subId: string;

      // ── FIX: Always upsert into existing submission record ─────────────────
      // Rater App and Supplier App share ONE submission per location+month+year.
      // Rater adds/updates Likert responses; Supplier adds numeric responses.
      // Neither overwrites the other's data.
      const { data: existing } = await supabase.from("submissions")
        .select("id")
        .eq("location_id", form.location_id)
        .eq("reporting_month", form.month)
        .eq("reporting_year", form.year);

      if (existing?.length) {
        // Submission exists (likely created by Supplier App) — update reviewer info only
        subId = existing[0].id;
        await supabase.from("submissions").update({
          reviewed_by: form.reviewer,
          reviewed_at: new Date().toISOString(),
        }).eq("id", subId);
      } else {
        // No submission yet — create one (internal ratings entered before LSP submits)
        const { data: newSub, error } = await supabase.from("submissions").insert({
          location_id: form.location_id,
          supplier_id: form.supplier_id,
          country_id: form.country_id,
          reporting_month: form.month,
          reporting_year: form.year,
          reviewed_by: form.reviewer,
          reviewed_at: new Date().toISOString(),
          status: "draft",
        }).select("id");
        if (error) throw error;
        subId = newSub![0].id;
      }

      // Upsert each Likert response individually (preserve any existing numeric values)
      const toSave = metrics.filter(m => values[m.id] !== undefined);
      for (const m of toSave) {
        const { data: ex } = await supabase.from("responses").select("id")
          .eq("submission_id", subId).eq("metric_id", m.id);
        if (ex?.length) {
          await supabase.from("responses").update({
            value_likert: values[m.id],
            prev_month_value: prevValues[m.id] || null,
            entered_by: form.reviewer,
          }).eq("id", ex[0].id);
        } else {
          await supabase.from("responses").insert({
            submission_id: subId,
            metric_id: m.id,
            value_likert: values[m.id],
            prev_month_value: prevValues[m.id] || null,
            entered_by: form.reviewer,
          });
        }
      }

      setSaved(true);
      toast({ title: "Ratings saved successfully" });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  if (saved) return (
    <div className="max-w-lg mx-auto mt-12 text-center space-y-4">
      <div className="text-5xl">✅</div>
      <h2 className="text-xl font-semibold text-gray-900">Ratings saved!</h2>
      <p className="text-gray-500">Internal ratings recorded for this submission.</p>
      <Button onClick={() => {
        setSaved(false); setValues({}); setPrevValues({});
        setApproved(false);
        setForm({ supplier_id: "", country_id: "", location_id: "", month: now.getMonth() + 1, year: now.getFullYear(), reviewer: "" });
      }}>Enter Another</Button>
    </div>
  );

  const metricsByCat = categories
    .map(cat => ({ ...cat, metrics: metrics.filter(m => m.category_id === cat.id) }))
    .filter(c => c.metrics.length > 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Enter Internal Ratings</h2>
        <p className="text-sm text-gray-500 mt-1">Rate qualitative Likert metrics. Previous month values pre-filled in blue.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Supplier & Period</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Supplier</Label>
            <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v, country_id: "", location_id: "" })}>
              <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Country</Label>
            <Select value={form.country_id} onValueChange={v => setForm({ ...form, country_id: v, location_id: "" })} disabled={!form.supplier_id}>
              <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
              <SelectContent>{countries.map(c => <SelectItem key={c.id} value={c.id}>{c.country_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Location</Label>
            <Select value={form.location_id} onValueChange={v => setForm({ ...form, location_id: v })} disabled={!form.country_id}>
              <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
              <SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Month</Label>
            <Select value={String(form.month)} onValueChange={v => setForm({ ...form, month: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FULL_MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Year</Label>
            <Select value={String(form.year)} onValueChange={v => setForm({ ...form, year: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Reviewed by</Label>
            <Input value={form.reviewer} onChange={e => setForm({ ...form, reviewer: e.target.value })} placeholder="Your name" />
          </div>
        </div>
      </div>

      {form.location_id && <>
        {Object.keys(prevValues).length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
            ℹ️ Previous month ratings pre-filled in blue. Review and modify where needed.
          </div>
        )}

        {metricsByCat.map((cat, ci) => (
          <div key={cat.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold"
                style={{ background: CAT_COLORS[ci] + "22", color: CAT_COLORS[ci] }}>{cat.number}</span>
              <span className="font-semibold text-sm text-gray-800">{cat.name}</span>
              <span className="ml-auto text-xs text-gray-400">{cat.weight_pct}% · {cat.max_points} pts</span>
            </div>
            <div className="divide-y divide-gray-50">
              {cat.metrics.map(m => {
                const val = values[m.id];
                const prev = prevValues[m.id];
                const isCarried = prev !== undefined && val === prev;
                const mAnchors = getAnchors(m.id);
                const selAnchor = mAnchors.find(a => a.score === val);
                return (
                  <div key={m.id} className={`p-4 ${isCarried ? "bg-blue-50/50" : ""}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{m.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {m.sub_categories?.name && <span>{m.sub_categories.name} · </span>}
                          {m.max_points} pts
                        </div>
                        {isCarried && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded mt-1">
                            ↩ carried from last month
                          </span>
                        )}
                        {prev !== undefined && (
                          <div className="text-xs text-gray-400 mt-1">Last month: {prev}/5</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-2xl font-bold ${val ? "text-gray-900" : "text-gray-300"}`}>
                          {val ?? "—"}<span className="text-sm font-normal text-gray-400">/5</span>
                        </div>
                        {selAnchor && <div className="text-xs font-semibold text-blue-600">{selAnchor.label}</div>}
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {mAnchors.map(anchor => {
                        const isSel = val === anchor.score;
                        const isCarriedVal = isCarried && prev === anchor.score;
                        return (
                          <button key={anchor.score}
                            onClick={() => setValues({ ...values, [m.id]: anchor.score })}
                            className={`flex flex-col items-center rounded-lg border-2 p-2 transition-all cursor-pointer ${
                              isSel ? "border-blue-500 bg-blue-500 text-white"
                              : isCarriedVal ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                            }`}>
                            <span className="text-lg font-bold">{anchor.score}</span>
                            <span className={`text-center mt-1 leading-tight ${isSel ? "text-white/80" : "text-gray-400"}`}
                              style={{ fontSize: "9px" }}>{anchor.label}</span>
                            {anchor.description && (
                              <span className={`text-center mt-0.5 leading-tight hidden sm:block ${isSel ? "text-white/70" : "text-gray-300"}`}
                                style={{ fontSize: "8px" }}>
                                {anchor.description.length > 40 ? anchor.description.substring(0, 40) + "…" : anchor.description}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="font-semibold text-green-800 mb-3">✓ Confirm & Save Ratings</h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-green-600" />
            <span className="text-sm text-gray-700">
              I confirm all ratings have been reviewed. Carry-forward values checked and modified where required.
            </span>
          </label>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSubmit} disabled={!approved || saving || !form.reviewer || !form.location_id}
              className="bg-green-600 hover:bg-green-700 text-white">
              {saving ? "Saving..." : "✓ Save Ratings"}
            </Button>
          </div>
        </div>
      </>}
    </div>
  );
}
