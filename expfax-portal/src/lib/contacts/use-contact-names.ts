"use client";

import { useState, useEffect, useMemo } from "react";
import { normalizePhone } from "@/lib/phone";

export interface ContactInfo {
  name: string;
  company: string;
}

/**
 * Batch-resolves contact names for a list of fax numbers.
 * Returns a map of normalizedNumber → { name, company }.
 * Contact names always take priority over whatever name was stored on a fax record.
 * Re-fetches automatically whenever the set of numbers changes.
 */
export function useContactNames(numbers: string[]): Record<string, ContactInfo> {
  const [contacts, setContacts] = useState<Record<string, ContactInfo>>({});

  // Build a stable cache key so the effect only fires when numbers actually change
  const key = useMemo(
    () => [...new Set(numbers.map(normalizePhone).filter(Boolean))].sort().join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numbers.map(normalizePhone).filter(Boolean).sort().join(",")]
  );

  useEffect(() => {
    if (!key) {
      setContacts({});
      return;
    }
    fetch("/api/contacts/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: key.split(",") }),
    })
      .then((r) => (r.ok ? r.json() : { contacts: {} }))
      .then((data) => setContacts(data.contacts ?? {}))
      .catch(() => {/* non-critical */});
  }, [key]);

  return contacts;
}
