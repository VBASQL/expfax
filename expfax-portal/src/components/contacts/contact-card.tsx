"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Star, MoreVertical, Edit, Trash2, Phone } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatPhone } from "@/lib/phone";

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
              <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent focus-visible:outline-none">
                <MoreVertical className="h-4 w-4" />
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
          <Phone className="h-3 w-3" /> {formatPhone(contact.faxNumber)}
        </p>
        {contact.company && <p className="text-xs text-slate-500 mt-1">{contact.company}</p>}
      </CardContent>
    </Card>
  );
}
