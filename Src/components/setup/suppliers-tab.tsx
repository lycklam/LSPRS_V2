import { useState, useEffect } from "react";
import { supabase, deleteSupplierCascade } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const EMPTY = { name: "", business_type: "", contract_type: "", contact_name: "", contact_email: "" };

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("suppliers").select("*").order("name");
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setSuppliers(data || []);
    setLoading(false);
  };

  const save = async () => {
    if (!form.name || !form.business_type) {
      toast({ title: "Required fields missing", description: "Name and business type are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name, business_type: form.business_type,
        contract_type: form.contract_type || null,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
      };
      const { error } = editId
        ? await supabase.from("suppliers").update(payload).eq("id", editId)
        : await supabase.from("suppliers").insert({ ...payload, status: "active" });
      if (error) throw error;
      toast({ title: editId ? "Supplier updated" : "Supplier added" });
      setForm(EMPTY); setEditId(null); await load();
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const startEdit = (s: any) => {
    setEditId(s.id);
    setForm({ name: s.name, business_type: s.business_type || "", contract_type: s.contract_type || "", contact_name: s.contact_name || "", contact_email: s.contact_email || "" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteSupplierCascade(deleteTarget.id);
      toast({ title: "Deleted", description: `${deleteTarget.name} and all linked data removed.` });
      setDeleteTarget(null); await load();
    } catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const typeLabel = (t: string) => t === "B2B" ? "B2B — Pallet" : t === "B2C" ? "B2C — Parcel" : t === "both" ? "B2B & B2C" : "—";
  const typeClass = (t: string) => t === "B2B" ? "bg-blue-100 text-blue-700" : t === "B2C" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600";

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4">{editId ? "Edit Supplier" : "Add Supplier"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Supplier Name *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. DHL Supply Chain" />
          </div>
          <div className="space-y-1">
            <Label>Business Type *</Label>
            <Select value={form.business_type} onValueChange={v => setForm({ ...form, business_type: v })}>
              <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="B2B">B2B — Pallet business</SelectItem>
                <SelectItem value="B2C">B2C — Parcel business</SelectItem>
                <SelectItem value="both">Both B2B & B2C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Contract Type</Label>
            <Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}>
              <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3PL Full Service">3PL Full Service</SelectItem>
                <SelectItem value="Transport Only">Transport Only</SelectItem>
                <SelectItem value="Warehousing Only">Warehousing Only</SelectItem>
                <SelectItem value="Last Mile">Last Mile</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Contact Name</Label>
            <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Account manager" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Contact Email</Label>
            <Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="email@supplier.com" />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={save} disabled={saving || !form.name || !form.business_type}>
            {saving ? "Saving..." : editId ? "Update Supplier" : "+ Add Supplier"}
          </Button>
          {editId && <Button variant="outline" onClick={() => { setEditId(null); setForm(EMPTY); }}>Cancel</Button>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">
          Existing Suppliers ({suppliers.length})
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No suppliers yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Name","Type","Contract","Contact",""].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${typeClass(s.business_type)}`}>
                      {typeLabel(s.business_type)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{s.contract_type || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{s.contact_name || "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => startEdit(s)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(s)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and ALL linked
              countries, locations, submissions and responses. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
