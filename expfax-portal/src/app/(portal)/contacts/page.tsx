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
