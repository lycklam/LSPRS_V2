import { useState, useEffect } from "react";
import { supabase, deleteLocationCascade } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const EMPTY = { supplier_id: "", country_id: "", name: "", address: "", site_type: "", site_manager: "" };

// ── FIX: Added "transport" to match updated DB constraint ─────────────────────
const SITE_TYPES: { value: string; label: string }[] = [
  { value: "DC",          label: "Distribution Centre" },
  { value: "cross-dock",  label: "Cross-dock" },
  { value: "last-mile",   label: "Last Mile Hub" },
  { value: "transport",   label: "Transport" },
  { value: "other",       label: "Other" },
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
    const { data, error } = await supabase
      .from("locations")
      .select("*, suppliers(name), countries(country_name)")
      .order("name");
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setLocations(data || []);
    setLoading(false);
  };

  const save = async () => {
    if (!form.supplier_id || !form.country_id || !form.name || !form.site_type) {
      toast({ title: "Required fields missing", description: "Supplier, country, name and site type are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplier_id: form.supplier_id,
        country_id: form.country_id,
        name: form.name,
        address: form.address || null,
        site_type: form.site_type,
        site_manager: form.site_manager || null,
        status: "active" as const,
      };
      const { error } = editId
        ? await supabase.from("locations").update(payload).eq("id", editId)
        : await supabase.from("locations").insert(payload);
      if (error) throw error;
      toast({ title: editId ? "Location updated" : "Location added" });
      setForm(EMPTY); setEditId(null); await load();
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const startEdit = (l: any) => {
    setEditId(l.id);
    setForm({
      supplier_id: l.supplier_id,
      country_id: l.country_id,
      name: l.name,
      address: l.address || "",
      site_type: l.site_type || "",
      site_manager: l.site_manager || "",
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteLocationCascade(deleteTarget.id);
      toast({ title: "Deleted", description: `${deleteTarget.name} and all linked data removed.` });
      setDeleteTarget(null); await load();
    } catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const siteLabel = (t: string) => SITE_TYPES.find(s => s.value === t)?.label ?? t;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4">{editId ? "Edit Location" : "Add Location"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Supplier *</Label>
            <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v, country_id: "" })}>
              <SelectTrigger><SelectValue placeholder="— Select supplier —" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Country *</Label>
            <Select value={form.country_id} onValueChange={v => setForm({ ...form, country_id: v })} disabled={!form.supplier_id}>
              <SelectTrigger><SelectValue placeholder="— Select country —" /></SelectTrigger>
              <SelectContent>{filteredCountries.map(c => <SelectItem key={c.id} value={c.id}>{c.country_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Location Name *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amsterdam DC" />
          </div>
          <div className="space-y-1"><Label>Site Type *</Label>
            <Select value={form.site_type} onValueChange={v => setForm({ ...form, site_type: v })}>
              <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
              <SelectContent>
                {SITE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Address</Label>
            <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
          </div>
          <div className="space-y-1"><Label>Site Manager</Label>
            <Input value={form.site_manager} onChange={e => setForm({ ...form, site_manager: e.target.value })} placeholder="Name" />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={save} disabled={saving || !form.supplier_id || !form.country_id || !form.name || !form.site_type}>
            {saving ? "Saving..." : editId ? "Update Location" : "+ Add Location"}
          </Button>
          {editId && <Button variant="outline" onClick={() => { setEditId(null); setForm(EMPTY); }}>Cancel</Button>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">
          Existing Locations ({locations.length})
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No locations yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Supplier", "Country", "Location", "Site Type", "Manager", ""].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locations.map(l => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-500">{l.suppliers?.name || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{l.countries?.country_name || "—"}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{l.name}</td>
                  <td className="px-5 py-3 text-gray-500">{siteLabel(l.site_type)}</td>
                  <td className="px-5 py-3 text-gray-500">{l.site_manager || "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => startEdit(l)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(l)}>Delete</Button>
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
              This will permanently delete <strong>{deleteTarget?.name}</strong> and ALL linked submissions and responses. This cannot be undone.
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
