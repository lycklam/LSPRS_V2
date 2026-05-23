import { useState, useEffect } from "react";
import { supabase, deleteCountryCascade } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
    if (!form.supplier_id || !form.country_name) {
      toast({ title: "Required fields missing", description: "Supplier and country name are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { supplier_id: form.supplier_id, country_name: form.country_name, region: form.region || null, manager_name: form.manager_name || null };
      const { error } = editId
        ? await supabase.from("countries").update(payload).eq("id", editId)
        : await supabase.from("countries").insert(payload);
      if (error) throw error;
      toast({ title: editId ? "Country updated" : "Country added" });
      setForm(EMPTY); setEditId(null); await load();
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const startEdit = (c: any) => {
    setEditId(c.id);
    setForm({ supplier_id: c.supplier_id, country_name: c.country_name, region: c.region || "", manager_name: c.manager_name || "" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCountryCascade(deleteTarget.id);
      toast({ title: "Deleted", description: `${deleteTarget.country_name} and all linked data removed.` });
      setDeleteTarget(null); await load();
    } catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4">{editId ? "Edit Country" : "Add Country"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Supplier *</Label>
            <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
              <SelectTrigger><SelectValue placeholder="— Select supplier —" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Country Name *</Label><Input value={form.country_name} onChange={e => setForm({ ...form, country_name: e.target.value })} placeholder="e.g. Netherlands" /></div>
          <div className="space-y-1"><Label>Region</Label><Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="e.g. Western Europe" /></div>
          <div className="space-y-1"><Label>Country Manager</Label><Input value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} placeholder="Name" /></div>
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={save} disabled={saving || !form.supplier_id || !form.country_name}>{saving ? "Saving..." : editId ? "Update Country" : "+ Add Country"}</Button>
          {editId && <Button variant="outline" onClick={() => { setEditId(null); setForm(EMPTY); }}>Cancel</Button>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">Existing Countries ({countries.length})</div>
        {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> : countries.length === 0 ? <div className="p-8 text-center text-gray-400">No countries yet.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">{["Supplier","Country","Region","Manager",""].map(h => <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody>{countries.map(c => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-500">{c.suppliers?.name || "—"}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{c.country_name}</td>
                <td className="px-5 py-3 text-gray-500">{c.region || "—"}</td>
                <td className="px-5 py-3 text-gray-500">{c.manager_name || "—"}</td>
                <td className="px-5 py-3"><div className="flex gap-2 justify-end"><Button size="sm" variant="outline" onClick={() => startEdit(c)}>Edit</Button><Button size="sm" variant="destructive" onClick={() => setDeleteTarget(c)}>Delete</Button></div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.country_name}?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete <strong>{deleteTarget?.country_name}</strong> and ALL linked locations, submissions and responses. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Yes, delete everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
