"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ContactFormData {
  name: string;
  faxNumber: string;
  company: string;
  email: string;
  notes: string;
}

interface ContactDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ContactFormData) => Promise<void>;
  initialData?: ContactFormData;
  title: string;
}

export function ContactDialog({ open, onClose, onSave, initialData, title }: ContactDialogProps) {
  const [form, setForm] = useState<ContactFormData>({
    name: "", faxNumber: "", company: "", email: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData) setForm(initialData);
    else setForm({ name: "", faxNumber: "", company: "", email: "", notes: "" });
  }, [initialData, open]);

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required />
          </div>
          <div className="space-y-2">
            <Label>Fax Number *</Label>
            <Input value={form.faxNumber} onChange={(e) => setForm({ ...form, faxNumber: e.target.value })} placeholder="(555) 123-4567" required />
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name || !form.faxNumber}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
