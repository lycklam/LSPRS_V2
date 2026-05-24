import { useState, useEffect } from "react";
import { supabase, deleteLocationCascade } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const EMPTY = { supplier_id: "", country_id: "", name: "", address: "", site_type: "", site_manager: "" };
const SITE_TYPES = [
  { value: "DC", label: "Distribution Centre" },
  { value: "cross-dock", label: "Cross-dock" },
  { value: "last-mile", label: "Last Mile Hub" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
];

export default function LocationsTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [filteredCountries, setFilteredCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [saveError, setSaveError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("suppliers").select("id,name").order("name"),
      supabase.from("countries").select("id,supplier_id,country_name").order("country_name"),
    ]).then(([s, c]) => { setSuppliers(s.data || []); setCountries(c.data || []); });
    load();
  }, []);

  useEffect(() => {
    setFilteredCountries(countries.filter(c => c.supplier_id === form.supplier_id));
    if (!editId) setForm(f => ({ ...f, country_id: "" }));
  }, [form.supplier_id, countries]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("locations").select("*, suppliers(name), countries(country_name)").order("name");
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setLocations(data || []);
    setLoading(false);
  };

  const save = async () => {
    setSaveError("");
    if (!form.supplier_id) { setSaveError("Please select a supplier."); return; }
    if (!form.country_id) { setSaveError("Please select a country."); return; }
    if (!form.name.trim()) { setSaveError("Location name is required."); return; }
    if (!form.site_type) { setSaveError("Please select a site type."); return; }
    setSaving(true);
    try {
      const payload = { supplier_id: form.supplier_id, country_id: form.country_id, name: form.name.trim(), address: form.address || null, site_type: form.site_type, site_manager: form.site_manager || null, status: "active" as const };
      const { error } = editId
        ? await supabase.from("locations").update(payload).eq("id", editId)
        : await supabase.from("locations").insert(payload);
      if (error) throw error;
      toast({ title: editId ? "Location updated" : "Location added" });
      setForm(EMPTY); setEditId(null); await load();
    } catch (e: any) { setSaveError(e.message || "Save failed."); }
    setSaving(false);
  };

  const startEdit = (l: any) => {
    setSaveError("");
    setEditId(l.id);
    setForm({ supplier_id: l.supplier_id, country_id: l.country_id, name: l.name, address: l.address || "", site_type: l.site_type || "", site_manager: l.site_manager || "" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteLocationCascade(deleteTarget.id);
      toast({ title: "Location deleted" });
      setDeleteTarget(null); await load();
    } catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const siteLabel = (t: string) => SITE_TYPES.find(s => s.value === t)?.label ?? t;

  const S = `
    .lf{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
    .lf h3{font-size:15px;font-weight:700;color:#0F1B2D;margin:0 0 20px}
    .lf-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    @media(max-width:640px){.lf-grid{grid-template-columns:1fr}}
    .lf-fd{display:flex;flex-direction:column;gap:5px}
    .lf-fd label{font-size:12px;font-weight:700;color:#475569;letter-spacing:0.02em;text-transform:uppercase}
    .lf-fd input,.lf-fd select{height:38px;padding:0 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;color:#0F1B2D;background:#fff;outline:none;transition:border-color 0.15s,box-shadow 0.15s;font-family:'DM Sans',sans-serif;width:100%}
    .lf-fd select{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
    .lf-fd input:focus,.lf-fd select:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,0.12)}
    .lf-fd select:disabled{background:#F8FAFC;color:#94A3B8;cursor:not-allowed}
    .lf-err{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;font-size:13px;color:#B91C1C;font-weight:500;margin-top:14px}
    .lf-btns{display:flex;gap:10px;margin-top:20px}
    .lf-bp{height:38px;padding:0 18px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
    .lf-bp:hover{background:#1D4ED8}
    .lf-bp:disabled{background:#93C5FD;cursor:not-allowed}
    .lf-bo{height:38px;padding:0 18px;background:#fff;color:#475569;border:1.5px solid #CBD5E1;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
    .ltc{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,45,0.06)}
    .lth{padding:14px 20px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#0F1B2D;display:flex;align-items:center;justify-content:space-between;background:#FAFBFC}
    .ltcnt{font-size:12px;font-weight:600;background:#EFF6FF;color:#2563EB;padding:2px 10px;border-radius:20px}
    .ltt{width:100%;border-collapse:collapse}
    .ltt thead th{background:#F8FAFC;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748B;padding:10px 20px;border-bottom:1px solid #E2E8F0;text-align:left}
    .ltt tbody tr{border-bottom:1px solid #F1F5F9}
    .ltt tbody tr:last-child{border-bottom:none}
    .ltt tbody tr:hover{background:#F8FAFC}
    .ltt td{padding:12px 20px;font-size:13.5px;color:#334155;vertical-align:middle}
    .ltt td.nm{font-weight:600;color:#0F1B2D}
    .lt-empty{padding:48px 20px;text-align:center;color:#94A3B8;font-size:13.5px}
    .lt-acts{display:flex;gap:6px;justify-content:flex-end}
    .lt-be{height:30px;padding:0 12px;background:#F8FAFC;color:#475569;border:1.5px solid #E2E8F0;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
    .lt-be:hover{background:#EFF6FF;color:#2563EB;border-color:#BFDBFE}
    .lt-bd{height:30px;padding:0 12px;background:#FEF2F2;color:#DC2626;border:1.5px solid #FECACA;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
    .lt-bd:hover{background:#DC2626;color:#fff;border-color:#DC2626}
    .lt-mov{position:fixed;inset:0;background:rgba(15,27,45,0.4);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}
    .lt-m{background:#fff;border-radius:14px;padding:28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(15,27,45,0.2)}
    .lt-m h4{font-size:16px;font-weight:700;color:#0F1B2D;margin:0 0 10px}
    .lt-m p{font-size:13.5px;color:#64748B;line-height:1.6;margin:0 0 20px}
    .lt-ma{display:flex;gap:10px;justify-content:flex-end}
  `;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{S}</style>
      <div className="lf">
        <h3>{editId ? "✏️ Edit Location" : "Add Location"}</h3>
        <div className="lf-grid">
          <div className="lf-fd"><label>Supplier *</label>
            <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value, country_id: "" })}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="lf-fd"><label>Country *</label>
            <select value={form.country_id} disabled={!form.supplier_id} onChange={e => setForm({ ...form, country_id: e.target.value })}>
              <option value="">— Select country —</option>
              {filteredCountries.map(c => <option key={c.id} value={c.id}>{c.country_name}</option>)}
            </select>
          </div>
          <div className="lf-fd"><label>Location Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amsterdam DC" />
          </div>
          <div className="lf-fd"><label>Site Type *</label>
            <select value={form.site_type} onChange={e => setForm({ ...form, site_type: e.target.value })}>
              <option value="">— Select type —</option>
              {SITE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="lf-fd"><label>Address</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
          </div>
          <div className="lf-fd"><label>Site Manager</label>
            <input value={form.site_manager} onChange={e => setForm({ ...form, site_manager: e.target.value })} placeholder="Name" />
          </div>
        </div>
        {saveError && <div className="lf-err">⚠ {saveError}</div>}
        <div className="lf-btns">
          <button className="lf-bp" onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Update Location" : "+ Add Location"}</button>
          {editId && <button className="lf-bo" onClick={() => { setEditId(null); setForm(EMPTY); setSaveError(""); }}>Cancel</button>}
        </div>
      </div>

      <div className="ltc">
        <div className="lth"><span>Locations</span><span className="ltcnt">{locations.length}</span></div>
        {loading ? <div className="lt-empty">Loading…</div> : locations.length === 0 ? <div className="lt-empty">No locations yet.</div> : (
          <table className="ltt">
            <thead><tr><th>Supplier</th><th>Country</th><th>Location</th><th>Type</th><th>Manager</th><th></th></tr></thead>
            <tbody>{locations.map(l => (
              <tr key={l.id}>
                <td>{l.suppliers?.name || "—"}</td>
                <td>{l.countries?.country_name || "—"}</td>
                <td className="nm">{l.name}</td>
                <td>{siteLabel(l.site_type)}</td>
                <td>{l.site_manager || "—"}</td>
                <td><div className="lt-acts"><button className="lt-be" onClick={() => startEdit(l)}>Edit</button><button className="lt-bd" onClick={() => setDeleteTarget(l)}>Delete</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {deleteTarget && (
        <div className="lt-mov" onClick={() => setDeleteTarget(null)}>
          <div className="lt-m" onClick={e => e.stopPropagation()}>
            <h4>Delete {deleteTarget.name}?</h4>
            <p>This will permanently delete <strong>{deleteTarget.name}</strong> and ALL linked submissions and responses. This cannot be undone.</p>
            <div className="lt-ma">
              <button className="lf-bo" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="lt-bd" style={{ height: 38, padding: "0 18px", fontSize: 13.5 }} onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
