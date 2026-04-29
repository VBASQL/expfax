import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";
import type { Contact } from "@/types";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const csvText = await request.text();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    return NextResponse.json({ success: false, error: "Empty CSV" }, { status: 400 });
  }

  const firstFields = parseCSVLine(lines[0]);
  const hasHeader = firstFields.some(
    (f) => f.toLowerCase() === "name" || f.toLowerCase() === "faxnumber" || f.toLowerCase() === "fax number"
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const container = await containers.contacts();
  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    const name = fields[0] || "";
    const faxNumber = fields[1] || "";
    const company = fields[2] || "";
    const email = fields[3] || "";
    const notes = fields[4] || "";

    if (!name && !faxNumber) { skipped++; continue; }

    const contact: Contact = {
      id: uuid(),
      userId: user.id,
      name: name || faxNumber,
      faxNumber,
      company,
      email,
      notes,
      isFavorite: false,
      groups: [],
      createdAt: now,
      updatedAt: now,
    };

    await container.items.create(contact);
    imported++;
  }

  return NextResponse.json({ success: true, imported, skipped });
}
