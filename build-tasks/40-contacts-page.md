# Task 40 — Contacts Page (CRUD + Groups)

## Goal
Build the contacts management page: list, add, edit, delete, groups, favorites, import/export CSV.

## Files to Create
- `src/app/(portal)/contacts/page.tsx`
- `src/components/contacts/contact-card.tsx`
- `src/components/contacts/contact-dialog.tsx`

## Dependencies
- shadcn components (Dialog, Command, etc.)
- API routes from task 41

## Design (from design doc section 7.6)
- Contact cards with: Name, Fax Number, Company, Email, Notes, Favorite star
- Add/Edit/Delete via dialog
- Import from CSV, Export to CSV
- Contact groups/tags
- Search contacts
- Quick-select when composing (enhanced in send form later)

## Implementation

### 1. Create `src/components/contacts/contact-card.tsx`

```tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Star, MoreVertical, Edit, Trash2, Phone } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ContactCardProps {
  contact: {
    id: string;
    name: string;
    faxNumber: string;
    company: string;
    email: string;
    isFavorite: boolean;
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const colors = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500", "bg-rose-500", "bg-teal-500"];

export function ContactCard({ contact, onEdit, onDelete, onToggleFavorite }: ContactCardProps) {
  const initials = contact.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const color = colors[contact.name.charCodeAt(0) % colors.length];

  return (
    <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-semibold text-sm`}>
            {initials}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onToggleFavorite(contact.id)} className="text-slate-300 hover:text-amber-400 transition-colors">
              <Star className={`h-4 w-4 ${contact.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(contact.id)}>
                  <Edit className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(contact.id)} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="font-semibold text-sm mb-1">{contact.name}</p>
        <p className="text-xs text-slate-400 font-mono flex items-center gap-1">
          <Phone className="h-3 w-3" /> {contact.faxNumber}
        </p>
        {contact.company && <p className="text-xs text-slate-500 mt-1">{contact.company}</p>}
      </CardContent>
    </Card>
  );
}
```

### 2. Create `src/components/contacts/contact-dialog.tsx`

Add/Edit dialog for contacts.

```tsx
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
```

### 3. Create `src/app/(portal)/contacts/page.tsx`

Full contacts page with grid, search, add/edit/delete, import/export.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContactCard } from "@/components/contacts/contact-card";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { Plus, Search, Upload, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Contact {
  id: string; name: string; faxNumber: string; company: string; email: string; notes: string; isFavorite: boolean;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  const loadContacts = useCallback(() => {
    const params = new URLSearchParams(search ? { search } : {});
    fetch(`/api/contacts?${params}`).then((r) => r.json()).then((data) => setContacts(data.items || []));
  }, [search]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  async function handleSave(data: { name: string; faxNumber: string; company: string; email: string; notes: string }) {
    if (editingContact) {
      await fetch(`/api/contacts/${editingContact.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    setEditingContact(null);
    loadContacts();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    loadContacts();
  }

  async function handleToggleFavorite(id: string) {
    await fetch(`/api/contacts/${id}/favorite`, { method: "POST" });
    loadContacts();
  }

  function handleEdit(id: string) {
    const contact = contacts.find((c) => c.id === id);
    if (contact) { setEditingContact(contact); setDialogOpen(true); }
  }

  async function handleExport() {
    const res = await fetch("/api/contacts/export");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
  }

  async function handleImportCsv() {
    if (!importCsv.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: importCsv,
      });
      const data = await res.json();
      if (data.success) {
        setImportResult({ imported: data.imported, skipped: data.skipped });
        loadContacts();
      }
    } catch { /* silent */ }
    setImporting(false);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportCsv(reader.result as string);
    reader.readAsText(file);
  }

  // Sort: favorites first, then alphabetical
  const sorted = [...contacts].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Contacts</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setImportOpen(true); setImportCsv(""); setImportResult(null); }}>
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button size="sm" onClick={() => { setEditingContact(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Contact
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input placeholder="Search contacts..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((c) => (
          <ContactCard key={c.id} contact={c} onEdit={handleEdit} onDelete={handleDelete} onToggleFavorite={handleToggleFavorite} />
        ))}
        {sorted.length === 0 && <p className="text-sm text-slate-400 col-span-3 text-center py-8">No contacts found</p>}
      </div>

      <ContactDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingContact(null); }}
        onSave={handleSave}
        initialData={editingContact || undefined}
        title={editingContact ? "Edit Contact" : "Add Contact"}
      />

      {/* Import CSV Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Contacts from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-400">
              Format: <code className="bg-slate-100 px-1 rounded">Name,FaxNumber,Company,Email,Notes</code> — one row per contact. Header row is optional.
            </p>
            <div className="space-y-2">
              <Label>Upload CSV file</Label>
              <Input type="file" accept=".csv,.txt" onChange={handleImportFile} />
            </div>
            <div className="space-y-2">
              <Label>Or paste CSV data</Label>
              <Textarea
                rows={8}
                placeholder={"Dr. Chen,(503) 555-0198,Pacific Medical,chen@pacific.com,Primary care\nNorthwest Insurance,(503) 555-0456,NWI Claims,,Insurance claims dept"}
                value={importCsv}
                onChange={(e) => setImportCsv(e.target.value)}
              />
            </div>
            {importResult && (
              <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3">
                ✅ Imported {importResult.imported} contacts{importResult.skipped > 0 ? `, skipped ${importResult.skipped} invalid rows` : ""}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              {importResult ? "Done" : "Cancel"}
            </Button>
            {!importResult && (
              <Button onClick={handleImportCsv} disabled={importing || !importCsv.trim()}>
                {importing ? "Importing..." : "Import"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/contacts` shows grid, search, add/edit/delete dialogs work

## Notes
- API routes for contacts (CRUD + export + import) are built in task 41
- Contact picker integration with send form is a follow-up
