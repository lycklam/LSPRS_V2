import { useState, useEffect } from "react";
import { supabase, deleteSupplierCascade } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const EMPTY = { name: "", business_type: "", contract_type: "", contact_name: "", contact_email: "" };

const CONTRACT_TYPES = ["3PL Full Service", "Transport Only", "Warehousing Only", "Last Mile", "Other"];
const BUSINESS_TYPES = [
  { value: "B2B", label: "B2B — Pallet business" },
  { value: "B2C", label: "B2C — Parcel business" },
  { value: "both", label: "Both B2B & B2C" },
];

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [saveError, setSaveError] = useState("");
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("suppliers").select("*").order("name");
    if (error) toast({ title: "Error loading suppliers", description: error.message, variant: "destructive" });
    else setSuppliers(data || []);
    setLoading(false);
  };

  const save = async () => {
    setSaveError("");
    if (!form.name.trim()) { setSaveError("Supplier name is required."); return; }
    if (!form.business_type) { setSaveError("Business type is required."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        business_type: form.business_type,
        contract_type: form.contract_type || null,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
      };
      const { error } = editId
        ? await supabase.from("suppliers").update(payload).eq("id", editId)
        : await supabase.from("suppliers").insert({ ...payload, status: "active" });
      if (error) throw error;
      toast({ title: editId ? "Supplier updated" : "Supplier added successfully" });
      setForm(EMPTY); setEditId(null); await load();
    } catch (e: any) {
      setSaveError(e.message || "Save failed — check your connection.");
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const startEdit = (s: any) => {
    setSaveError("");
    setEditId(s.id);
    setForm({ name: s.name, business_type: s.business_type || "", contract_type: s.contract_type || "", contact_name: s.contact_name || "", contact_email: s.contact_email || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditId(null); setForm(EMPTY); setSaveError(""); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteSupplierCascade(deleteTarget.id);
      toast({ title: "Supplier deleted", description: `${deleteTarget.name} and all linked data removed.` });
      setDeleteTarget(null); await load();
    } catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const typeLabel = (t: string) => BUSINESS_TYPES.find(b => b.value === t)?.label ?? "—";
  const typeBadge = (t: string) => {
    if (t === "B2B") return { bg: "#DBEAFE", color: "#1D4ED8" };
    if (t === "B2C") return { bg: "#DCFCE7", color: "#15803D" };
    return { bg: "#F1F5F9", color: "#475569" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .sform { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(15,27,45,0.06); }
        .sform h3 { font-size: 15px; font-weight: 700; color: #0F1B2D; margin: 0 0 20px; }
        .sform-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 640px) { .sform-grid { grid-template-columns: 1fr; } }
        .sform-full { grid-column: 1 / -1; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .field label { font-size: 12px; font-weight: 700; color: #475569; letter-spacing: 0.02em; text-transform: uppercase; }
        .field input {
          height: 38px; padding: 0 12px; border: 1.5px solid #CBD5E1;
          border-radius: 8px; font-size: 14px; color: #0F1B2D;
          background: #fff; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
          font-family: 'DM Sans', sans-serif; width: 100%;
        }
        .field input:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .field select {
          height: 38px; padding: 0 12px; border: 1.5px solid #CBD5E1;
          border-radius: 8px; font-size: 14px; color: #0F1B2D;
          background: #fff; outline: none; cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s;
          font-family: 'DM Sans', sans-serif; width: 100%;
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
        }
        .field select:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .error-msg { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #B91C1C; font-weight: 500; }
        .btn-row { display: flex; gap: 10px; margin-top: 20px; align-items: center; }
        .btn-primary {
          height: 38px; padding: 0 18px; background: #2563EB; color: #fff;
          border: none; border-radius: 8px; font-size: 13.5px; font-weight: 600;
          cursor: pointer; transition: background 0.15s; font-family: 'DM Sans', sans-serif;
        }
        .btn-primary:hover { background: #1D4ED8; }
        .btn-primary:disabled { background: #93C5FD; cursor: not-allowed; }
        .btn-outline {
          height: 38px; padding: 0 18px; background: #fff; color: #475569;
          border: 1.5px solid #CBD5E1; border-radius: 8px; font-size: 13.5px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif;
        }
        .btn-outline:hover { border-color: #94A3B8; color: #0F1B2D; }
        .btn-danger {
          height: 32px; padding: 0 12px; background: #FEF2F2; color: #DC2626;
          border: 1.5px solid #FECACA; border-radius: 6px; font-size: 12.5px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif;
        }
        .btn-danger:hover { background: #DC2626; color: #fff; border-color: #DC2626; }
        .btn-edit {
          height: 32px; padding: 0 12px; background: #F8FAFC; color: #475569;
          border: 1.5px solid #E2E8F0; border-radius: 6px; font-size: 12.5px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif;
        }
        .btn-edit:hover { background: #EFF6FF; color: #2563EB; border-color: #BFDBFE; }

        /* Supplier table card */
        .stable-card { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,27,45,0.06); }
        .stable-header { padding: 14px 20px; border-bottom: 1px solid #F1F5F9; font-size: 13px; font-weight: 700; color: #0F1B2D; display: flex; align-items: center; justify-content: space-between; background: #FAFBFC; }
        .stable-count { font-size: 12px; font-weight: 600; background: #EFF6FF; color: #2563EB; padding: 2px 10px; border-radius: 20px; }
        .stable { width: 100%; border-collapse: collapse; }
        .stable thead th { background: #F8FAFC; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #64748B; padding: 10px 20px; border-bottom: 1px solid #E2E8F0; text-align: left; white-space: nowrap; }
        .stable tbody tr { border-bottom: 1px solid #F1F5F9; transition: background 0.1s; }
        .stable tbody tr:last-child { border-bottom: none; }
        .stable tbody tr:hover { background: #F8FAFC; }
        .stable td { padding: 13px 20px; font-size: 13.5px; color: #334155; vertical-align: middle; }
        .stable td.name { font-weight: 600; color: #0F1B2D; }
        .type-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .action-cell { text-align: right; white-space: nowrap; }
        .actions { display: flex; gap: 6px; justify-content: flex-end; }
        .empty-state { padding: 48px 20px; text-align: center; color: #94A3B8; }
        .empty-state .icon { font-size: 32px; margin-bottom: 10px; }
        .empty-state p { font-size: 13.5px; }

        /* Delete modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(15,27,45,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(2px); }
        .modal { background: #fff; border-radius: 14px; padding: 28px; max-width: 420px; width: 100%; box-shadow: 0 20px 60px rgba(15,27,45,0.2); }
        .modal h4 { font-size: 16px; font-weight: 700; color: #0F1B2D; margin: 0 0 10px; }
        .modal p { font-size: 13.5px; color: #64748B; line-height: 1.6; margin: 0 0 20px; }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
      `}</style>

      {/* Form */}
      <div className="sform">
        <h3>{editId ? "✏️ Edit Supplier" : "Add New Supplier"}</h3>
        <div className="sform-grid">
          <div className="field">
            <label>Supplier Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. DHL Supply Chain" />
          </div>
          <div className="field">
            <label>Business Type *</label>
            <select value={form.business_type} onChange={e => setForm({ ...form, business_type: e.target.value })}>
              <option value="">— Select —</option>
              {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Contract Type</label>
            <select value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })}>
              <option value="">— Select —</option>
              {CONTRACT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Contact Name</label>
            <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Account manager name" />
          </div>
          <div className="field sform-full">
            <label>Contact Email</label>
            <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="email@supplier.com" />
          </div>
        </div>

        {saveError && <div className="error-msg" style={{ marginTop: 16 }}>⚠ {saveError}</div>}

        <div className="btn-row">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editId ? "Update Supplier" : "+ Add Supplier"}
          </button>
          {editId && <button className="btn-outline" onClick={cancelEdit}>Cancel</button>}
        </div>
      </div>

      {/* Table */}
      <div className="stable-card">
        <div className="stable-header">
          <span>Suppliers</span>
          <span className="stable-count">{suppliers.length}</span>
        </div>
        {loading ? (
          <div className="empty-state"><div className="icon">⏳</div><p>Loading suppliers…</p></div>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🏢</div>
            <p>No suppliers yet. Add your first one above.</p>
          </div>
        ) : (
          <table className="stable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Contract</th>
                <th>Contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => {
                const badge = typeBadge(s.business_type);
                return (
                  <tr key={s.id}>
                    <td className="name">{s.name}</td>
                    <td>
                      <span className="type-badge" style={{ background: badge.bg, color: badge.color }}>
                        {typeLabel(s.business_type)}
                      </span>
                    </td>
                    <td>{s.contract_type || "—"}</td>
                    <td>{s.contact_name || "—"}</td>
                    <td className="action-cell">
                      <div className="actions">
                        <button className="btn-edit" onClick={() => startEdit(s)}>Edit</button>
                        <button className="btn-danger" onClick={() => setDeleteTarget(s)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>Delete {deleteTarget.name}?</h4>
            <p>
              This will permanently delete <strong>{deleteTarget.name}</strong> and ALL linked countries,
              locations, submissions and responses. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" style={{ height: 38, padding: '0 18px', fontSize: 13.5 }} onClick={confirmDelete} disabled={saving}>
                {saving ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
