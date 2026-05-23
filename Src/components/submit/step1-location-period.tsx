import { useState, useEffect } from "react";
import { supabase, FULL_MONTHS } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  selection: any;
  onComplete: (selection: any) => void;
}

export default function Step1LocationPeriod({ selection, onComplete }: Props) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const now = new Date();
  const [form, setForm] = useState(selection || { supplier_id:"", country_id:"", location_id:"", month:now.getMonth()+1, year:now.getFullYear(), submitter:"" });

  useEffect(() => {
    supabase.from("suppliers").select("id,name,business_type").eq("status","active").order("name").then(({data})=>setSuppliers(data||[]));
  }, []);

  useEffect(() => {
    if(form.supplier_id) supabase.from("countries").select("id,country_name").eq("supplier_id",form.supplier_id).order("country_name").then(({data})=>setCountries(data||[]));
  }, [form.supplier_id]);

  useEffect(() => {
    if(form.country_id) supabase.from("locations").select("id,name").eq("country_id",form.country_id).eq("status","active").order("name").then(({data})=>setLocations(data||[]));
  }, [form.country_id]);

  const canContinue = form.supplier_id && form.country_id && form.location_id && form.month && form.year && form.submitter.trim();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div><h2 className="text-xl font-semibold text-gray-900">Step 1 — Identify Your Location & Period</h2><p className="text-sm text-gray-500 mt-1">Select your supplier, location and the month you are reporting for.</p></div>
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Supplier</Label>
            <Select value={form.supplier_id} onValueChange={v=>setForm({...form,supplier_id:v,country_id:"",location_id:""})}>
              <SelectTrigger><SelectValue placeholder="— Select supplier —"/></SelectTrigger>
              <SelectContent>{suppliers.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Country</Label>
            <Select value={form.country_id} onValueChange={v=>setForm({...form,country_id:v,location_id:""})} disabled={!form.supplier_id}>
              <SelectTrigger><SelectValue placeholder="— Select country —"/></SelectTrigger>
              <SelectContent>{countries.map(c=><SelectItem key={c.id} value={c.id}>{c.country_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Location / Warehouse</Label>
            <Select value={form.location_id} onValueChange={v=>setForm({...form,location_id:v})} disabled={!form.country_id}>
              <SelectTrigger><SelectValue placeholder="— Select location —"/></SelectTrigger>
              <SelectContent>{locations.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Reporting Month</Label>
            <Select value={String(form.month)} onValueChange={v=>setForm({...form,month:Number(v)})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{FULL_MONTHS.map((m,i)=><SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Reporting Year</Label>
            <Select value={String(form.year)} onValueChange={v=>setForm({...form,year:Number(v)})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{[2024,2025,2026].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Submitted by *</Label><Input value={form.submitter} onChange={e=>setForm({...form,submitter:e.target.value})} placeholder="Your full name"/></div>
        </div>
        <div className="mt-5 pt-4 border-t border-gray-100">
          <Button onClick={()=>onComplete(form)} disabled={!canContinue} className="bg-green-600 hover:bg-green-700 text-white">Continue to Data Entry →</Button>
          {!canContinue&&<p className="text-xs text-gray-400 mt-2">All fields including your name are required to continue.</p>}
        </div>
      </div>
    </div>
  );
}
