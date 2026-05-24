import { useState, useEffect } from "react";
import { supabase, deleteCountryCascade } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const EMPTY = { supplier_id: "", country_name: "", region: "", manager_name: "" };

export default function CountriesTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [saveError, setSaveError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("suppliers").select("id,name").order("name").then(({ data }) => setSuppliers(data || []));
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("countries").select("*, suppliers(name)").order("country_name");
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setCountries(data || []);
    setLoading(false);
  };

  const save = async () => {
    setSaveError("");
    if (!form.supplier_id) { setSaveError("Please select a supplier."); return; }
    if (!form.country_name.trim()) { setSaveError("Country name is required."); return; }
    setSaving(true);
    try {
      const payload = { supplier_id: form.supplier_id, country_name: form.country_name.trim(), region: form.region || null, manager_name: form.manager_name || null };
      const { error } = editId
        ? await supabase.from("countries").update(payload).eq("id", editId)
        : await supabase.from("countries").insert(payload);
      if (error) throw error;
      toast({ title: editId ? "Country updated" : "Country added" });
      setForm(EMPTY); setEditId(null); await load();
    } catch (e: any) { setSaveError(e.message || "Save failed."); }
    setSaving(false);
  };

  const startEdit = (c: any) => {
    setSaveError("");
    setEditId(c.id);
    setForm({ supplier_id: c.supplier_id, country_name: c.country_name, region: c.region || "", manager_name: c.manager_name || "" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCountryCascade(deleteTarget.id);
      toast({ title: "Country deleted", description: `${deleteTarget.country_name} and all linked data removed.` });
      setDeleteTarget(null); await load();
    } catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .cform { background:#fff; border:1px solid #E2E8F0; border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(15,27,45,0.06); }
        .cform h3 { font-size:15px; font-weight:700; color:#0F1B2D; margin:0 0 20px; }
        .cform-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media(max-width:640px){.cform-grid{grid-template-columns:1fr;}}
        .cfield { display:flex; flex-direction:column; gap:5px; }
        .cfield label { font-size:12px; font-weight:700; color:#475569; letter-spacing:0.02em; text-transform:uppercase; }
        .cfield input,.cfield select {
          height:38px; padding:0 12px; border:1.5px solid #CBD5E1; border-radius:8px;
          font-size:14px; color:#0F1B2D; background:#fff; outline:none;
          transition:border-color 0.15s, box-shadow 0.15s; font-family:'DM Sans',sans-serif; width:100%;
        }
        .cfield select { appearance:none; -webkit-appearance:none; cursor:pointer; padding-right:36px;
          background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center;
        }
        .cfield input:focus,.cfield select:focus { border-color:#2563EB; box-shadow:0 0 0 3px rgba(37,99,235,0.12); }
        .cfield input:disabled,.cfield select:disabled { background:#F8FAFC; color:#94A3B8; cursor:not-allowed; }
        .cerror { background:#FEF2F2; border:1px solid #FECACA; border-radius:8px; padding:10px 14px; font-size:13px; color:#B91C1C; font-weight:500; }
        .cbtn-row { display:flex; gap:10px; margin-top:20px; }
        .cbtn-primary { height:38px; padding:0 18px; background:#2563EB; color:#fff; border:none; border-radius:8px; font-size:13.5px; font-weight:600; cursor:pointer; transition:background 0.15s; font-family:'DM Sans',sans-serif; }
        .cbtn-primary:hover { background:#1D4ED8; }
        .cbtn-primary:disabled { background:#93C5FD; cursor:not-allowed; }
        .cbtn-outline { height:38px; padding:0 18px; background:#fff; color:#475569; border:1.5px solid #CBD5E1; border-radius:8px; font-size:13.5px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .ctable-card { background:#fff; border:1px solid #E2E8F0; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(15,27,45,0.06); }
        .ctable-header { padding:14px 20px; border-bottom:1px solid #F1F5F9; font-size:13px; font-weight:700; color:#0F1B2D; display:flex; align-items:center; justify-content:space-between; background:#FAFBFC; }
        .ctable-count { font-size:12px; font-weight:600; background:#EFF6FF; color:#2563EB; padding:2px 10px; border-radius:20px; }
        .ctable { width:100%; border-collapse:collapse; }
        .ctable thead th { background:#F8FAFC; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#64748B; padding:10px 20px; border-bottom:1px solid #E2E8F0; text-align:left; }
        .ctable tbody tr { border-bottom:1px solid #F1F5F9; transition:background 0.1s; }
        .ctable tbody tr:last-child { border-bottom:none; }
        .ctable tbody tr:hover { background:#F8FAFC; }
        .ctable td { padding:13px 20px; font-size:13.5px; color:#334155; vertical-align:middle; }
        .ctable td.name { font-weight:600; color:#0F1B2D; }
        .cempty { padding:48px 20px; text-align:center; color:#94A3B8; font-size:13.5px; }
        .caction-btns { display:flex; gap:6px; justify-content:flex-end; }
        .cbtn-edit { height:30px; padding:0 12px; background:#F8FAFC; color:#475569; border:1.5px solid #E2E8F0; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .cbtn-edit:hover { background:#EFF6FF; color:#2563EB; border-color:#BFDBFE; }
        .cbtn-del { height:30px; padding:0 12px; background:#FEF2F2; color:#DC2626; border:1.5px solid #FECACA; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .cbtn-del:hover { background:#DC2626; color:#fff; border-color:#DC2626; }
        .cmodal-overlay { position:fixed; inset:0; background:rgba(15,27,45,0.4); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(2px); }
        .cmodal { background:#fff; border-radius:14px; padding:28px; max-width:420px; width:100%; box-shadow:0 20px 60px rgba(15,27,45,0.2); }
        .cmodal h4 { font-size:16px; font-weight:700; color:#0F1B2D; margin:0 0 10px; }
        .cmodal p { font-size:13.5px; color:#64748B; line-height:1.6; margin:0 0 20px; }
        .cmodal-actions { display:flex; gap:10px; justify-content:flex-end; }
      `}</style>

      <div className="cform">
        <h3>{editId ? "✏️ Edit Country" : "Add Country"}</h3>
        <div className="cform-grid">
          <div className="cfield">
            <label>Supplier *</label>
            <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="cfield">
            <label>Country Name *</label>
            <input value={form.country_name} onChange={e => setForm({ ...form, country_name: e.target.value })} placeholder="e.g. Netherlands" />
          </div>
          <div className="cfield">
            <label>Region</label>
            <input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="e.g. Western Europe" />
          </div>
          <div className="cfield">
            <label>Country Manager</label>
            <input value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} placeholder="Name" />
          </div>
        </div>
        {saveError && <div className="cerror" style={{ marginTop: 16 }}>⚠ {saveError}</div>}
        <div className="cbtn-row">
          <button className="cbtn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Update Country" : "+ Add Country"}</button>
          {editId && <button className="cbtn-outline" onClick={() => { setEditId(null); setForm(EMPTY); setSaveError(""); }}>Cancel</button>}
        </div>
      </div>

      <div className="ctable-card">
        <div className="ctable-header"><span>Countries</span><span className="ctable-count">{countries.length}</span></div>
        {loading ? <div className="cempty">Loading…</div> : countries.length === 0 ? (
          <div className="cempty">No countries yet. Add one above.</div>
        ) : (
          <table className="ctable">
            <thead><tr><th>Supplier</th><th>Country</th><th>Region</th><th>Manager</th><th></th></tr></thead>
            <tbody>
              {countries.map(c => (
                <tr key={c.id}>
                  <td>{c.suppliers?.name || "—"}</td>
                  <td className="name">{c.country_name}</td>
                  <td>{c.region || "—"}</td>
                  <td>{c.manager_name || "—"}</td>
                  <td><div className="caction-btns"><button className="cbtn-edit" onClick={() => startEdit(c)}>Edit</button><button className="cbtn-del" onClick={() => setDeleteTarget(c)}>Delete</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deleteTarget && (
        <div className="cmodal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="cmodal" onClick={e => e.stopPropagation()}>
            <h4>Delete {deleteTarget.country_name}?</h4>
            <p>This will permanently delete <strong>{deleteTarget.country_name}</strong> and ALL linked locations, submissions and responses. This cannot be undone.</p>
            <div className="cmodal-actions">
              <button className="cbtn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="cbtn-del" style={{ height: 38, padding: "0 18px", fontSize: 13.5 }} onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
