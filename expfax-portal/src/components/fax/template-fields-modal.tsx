"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TemplateFieldValues {
  senderName: string;
  senderCompany: string;
  senderFax: string;
  senderVoice: string;
  receiverName: string;
  receiverCompany: string;
}

const defaultFields: TemplateFieldValues = {
  senderName: "",
  senderCompany: "",
  senderFax: "",
  senderVoice: "",
  receiverName: "",
  receiverCompany: "",
};

interface TemplateFieldsModalProps {
  open: boolean;
  onClose: () => void;
  values: TemplateFieldValues;
  onSave: (values: TemplateFieldValues) => void;
}

export function TemplateFieldsModal({ open, onClose, values, onSave }: TemplateFieldsModalProps) {
  const [fields, setFields] = useState<TemplateFieldValues>(defaultFields);

  useEffect(() => {
    if (open) setFields(values);
  }, [open, values]);

  function handleSave() {
    onSave(fields);
    onClose();
  }

  const fieldDefs = [
    { key: "senderName" as const, label: "Sender Name", placeholder: "Your Name", code: "$(SenderName)" },
    { key: "senderCompany" as const, label: "Sender Company", placeholder: "Your Company", code: "$(SenderCompany)" },
    { key: "senderFax" as const, label: "Sender Fax Number", placeholder: "(555) 123-4567", code: "$(SenderFax)" },
    { key: "senderVoice" as const, label: "Sender Voice Number", placeholder: "(555) 987-6543", code: "$(SenderVoice)" },
    { key: "receiverName" as const, label: "Receiver Name", placeholder: "Recipient Name", code: "$(ReceiverName)" },
    { key: "receiverCompany" as const, label: "Receiver Company", placeholder: "Recipient Company", code: "$(ReceiverCompany)" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>⚙</span> Cover Page Template Fields
          </DialogTitle>
          <p className="text-xs text-slate-400 mt-1">
            These values replace dynamic placeholders in the selected cover page template.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fieldDefs.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{f.label}</Label>
                <code className="text-[10px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                  {f.code}
                </code>
              </div>
              <Input
                value={fields[f.key]}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Fields</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
