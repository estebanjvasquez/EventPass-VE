import type { FloorplanElement } from "./model";

export function fromVenueElement(row: {
  id: string;
  label: string;
  element_type: string;
  status: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata?: {
    object_type?: FloorplanElement["objectType"];
    purpose?: string;
    rotation?: FloorplanElement["rotation"];
    color?: string;
    door_role?: FloorplanElement["doorRole"];
    assigned_company_name?: string;
  } | null;
}): FloorplanElement {
  return {
    id: row.id,
    label: row.label,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    status: row.status as FloorplanElement["status"],
    kind:
      row.element_type === "stand"
        ? "stand"
        : row.element_type === "aisle"
          ? "aisle"
          : row.element_type === "zone"
            ? "zone"
            : "object",
    objectType: row.metadata?.object_type,
    purpose: row.metadata?.purpose,
    rotation: row.metadata?.rotation,
    color: row.metadata?.color,
    doorRole: row.metadata?.door_role,
    assignedCompanyName: row.metadata?.assigned_company_name,
  };
}
