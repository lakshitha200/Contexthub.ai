"use client";

import { Check, ChevronDown, Globe, Layers } from "lucide-react";
import { Dropdown, DropdownItem, DropdownLabel } from "@/components/ui/dropdown";
import { useWorkspace } from "@/lib/store/workspace-context";
import { colorFromString } from "@/lib/utils";

/** Choose which collection a new conversation is grounded in (or the whole ws). */
export function ScopeSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (collectionId: string | null) => void;
}) {
  const { collections } = useWorkspace();
  const active = collections.find((c) => c.id === value);

  return (
    <Dropdown
      trigger={
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-secondary">
          {active ? (
            <span className="h-2 w-2 rounded-full" style={{ background: colorFromString(active.name) }} />
          ) : (
            <Globe className="h-3.5 w-3.5" />
          )}
          {active ? active.name : "Whole workspace"}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      }
    >
      <DropdownLabel>Search scope</DropdownLabel>
      <DropdownItem icon={<Globe className="h-4 w-4" />} onClick={() => onChange(null)}>
        <span className="flex-1">Whole workspace</span>
        {value === null && <Check className="h-4 w-4 text-primary" />}
      </DropdownItem>
      {collections.length > 0 && <DropdownLabel>Collections</DropdownLabel>}
      {collections.map((c) => (
        <DropdownItem
          key={c.id}
          icon={<Layers className="h-4 w-4" />}
          onClick={() => onChange(c.id)}
        >
          <span className="flex-1 truncate">{c.name}</span>
          {value === c.id && <Check className="h-4 w-4 text-primary" />}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
