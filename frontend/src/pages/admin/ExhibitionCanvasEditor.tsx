import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair,
  Bath,
  BrickWall,
  Camera,
  Coffee,
  Copy,
  DoorOpen,
  Eye,
  EyeOff,
  FileUp,
  Flower2,
  Info,
  Lock,
  LogIn,
  Maximize2,
  Monitor,
  Move,
  Pentagon,
  Plus,
  Presentation,
  Redo2,
  Ruler,
  Save,
  ShieldCheck,
  Sofa,
  Table2,
  Trash2,
  Trees,
  Undo2,
  Unlock,
  Waves,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { ExhibitionKonvaStage } from "./exhibition/ExhibitionKonvaStage";
import { standSizeColor } from "./exhibition/standSizeColor";
import { renderBlueprint } from "./exhibition/blueprint";

type Kind =
  | "stand"
  | "aisle"
  | "door"
  | "access"
  | "emergency_exit"
  | "security"
  | "wall"
  | "column"
  | "plant"
  | "table"
  | "sofa"
  | "seating"
  | "information"
  | "camera_360"
  | "cafe_station"
  | "restroom"
  | "fountain"
  | "forum"
  | "press_area"
  | "external_area"
  | "flow_arrow"
  | "special"
  | "polygon"
  | "lobby"
  | "blank";
type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shape?: "rect" | "polygon";
  points?: number[];
};
type SceneElement = {
  id: string;
  label: string;
  element_type?: string;
  status?: string;
  geometry: Geometry;
  layer: string;
  z_index: number;
  locked: boolean;
  visible: boolean;
  public_visible?: boolean;
  booth_type?: string | null;
  area_m2?: number | null;
  price?: number | null;
  currency?: string | null;
  tags?: string[];
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
};
type Company = { id: string; name: string };
type Assignment = { element_id: string; company_id: string };

const WORLD = { width: 40, height: 24 };
type Snapshot = { elements: SceneElement[]; metadata: Record<string, unknown> };
const DEFAULTS: Record<
  Kind,
  { label: string; width: number; height: number; layer: string; color: string }
> = {
  stand: {
    label: "Stand",
    width: 3,
    height: 3,
    layer: "layout",
    color: "#d1fae5",
  },
  aisle: {
    label: "Pasillo",
    width: 4,
    height: 1.5,
    layer: "circulation",
    color: "#cbd5e1",
  },
  door: {
    label: "Puerta",
    width: 1.2,
    height: 0.35,
    layer: "circulation",
    color: "#fef3c7",
  },
  access: {
    label: "Acceso",
    width: 1.5,
    height: 1,
    layer: "circulation",
    color: "#dbeafe",
  },
  emergency_exit: {
    label: "Salida de emergencia",
    width: 2.2,
    height: 1,
    layer: "circulation",
    color: "#fee2e2",
  },
  security: {
    label: "Verificador",
    width: 2,
    height: 1.5,
    layer: "circulation",
    color: "#fee2e2",
  },
  wall: {
    label: "Muro",
    width: 5,
    height: 0.3,
    layer: "architecture",
    color: "#64748b",
  },
  column: {
    label: "Columna",
    width: 0.6,
    height: 0.6,
    layer: "architecture",
    color: "#94a3b8",
  },
  plant: {
    label: "Planta",
    width: 1,
    height: 1,
    layer: "architecture",
    color: "#dcfce7",
  },
  table: {
    label: "Mesa",
    width: 2,
    height: 1,
    layer: "furniture",
    color: "#fef3c7",
  },
  sofa: {
    label: "Sofá",
    width: 2.5,
    height: 1,
    layer: "furniture",
    color: "#ede9fe",
  },
  seating: {
    label: "Bloque de sillas",
    width: 6,
    height: 4,
    layer: "furniture",
    color: "#f1f5f9",
  },
  information: {
    label: "Información",
    width: 2.5,
    height: 1,
    layer: "service",
    color: "#e0f2fe",
  },
  camera_360: {
    label: "Cámara 360",
    width: 3,
    height: 3,
    layer: "service",
    color: "#f3e8ff",
  },
  cafe_station: {
    label: "Estación café",
    width: 4,
    height: 2,
    layer: "service",
    color: "#fef3c7",
  },
  restroom: {
    label: "Baños",
    width: 5,
    height: 3,
    layer: "service",
    color: "#dbeafe",
  },
  fountain: {
    label: "Fuente",
    width: 6,
    height: 2,
    layer: "architecture",
    color: "#bae6fd",
  },
  forum: {
    label: "Foro / tarima",
    width: 8,
    height: 4,
    layer: "layout",
    color: "#e2e8f0",
  },
  press_area: {
    label: "Set de prensa",
    width: 5,
    height: 3,
    layer: "layout",
    color: "#fce7f3",
  },
  external_area: {
    label: "Área externa",
    width: 6,
    height: 4,
    layer: "architecture",
    color: "#ecfccb",
  },
  flow_arrow: {
    label: "Flujo",
    width: 3,
    height: 0.25,
    layer: "annotation",
    color: "#2563eb",
  },
  special: {
    label: "Área especial",
    width: 4,
    height: 3,
    layer: "layout",
    color: "#f3e8ff",
  },
  polygon: {
    label: "Área irregular",
    width: 4,
    height: 3,
    layer: "layout",
    color: "#f3e8ff",
  },
  lobby: {
    label: "Lobby",
    width: 4,
    height: 2,
    layer: "architecture",
    color: "#e0e7ff",
  },
  blank: {
    label: "Espacio libre",
    width: 3,
    height: 2,
    layer: "layout",
    color: "#f8fafc",
  },
};
type PaletteCategory =
  | "Comercial"
  | "Circulación"
  | "Servicios"
  | "Foro y prensa"
  | "Mobiliario"
  | "Arquitectura"
  | "Avanzado";
const palette: {
  kind: Kind;
  label: string;
  icon: typeof Armchair;
  category: PaletteCategory;
}[] = [
  { kind: "stand", label: "Stand", icon: Armchair, category: "Comercial" },
  { kind: "aisle", label: "Pasillo", icon: Move, category: "Circulación" },
  { kind: "door", label: "Puerta", icon: DoorOpen, category: "Circulación" },
  {
    kind: "access",
    label: "Entrada / salida",
    icon: LogIn,
    category: "Circulación",
  },
  {
    kind: "emergency_exit",
    label: "Salida emergencia",
    icon: DoorOpen,
    category: "Circulación",
  },
  {
    kind: "security",
    label: "Control",
    icon: ShieldCheck,
    category: "Circulación",
  },
  { kind: "flow_arrow", label: "Flujo", icon: Move, category: "Circulación" },
  { kind: "restroom", label: "Baños", icon: Bath, category: "Servicios" },
  {
    kind: "cafe_station",
    label: "Estación café",
    icon: Coffee,
    category: "Servicios",
  },
  {
    kind: "camera_360",
    label: "Cámara 360",
    icon: Camera,
    category: "Servicios",
  },
  {
    kind: "information",
    label: "Información",
    icon: Info,
    category: "Servicios",
  },
  {
    kind: "forum",
    label: "Foro / tarima",
    icon: Presentation,
    category: "Foro y prensa",
  },
  {
    kind: "press_area",
    label: "Set de prensa",
    icon: Monitor,
    category: "Foro y prensa",
  },
  {
    kind: "seating",
    label: "Bloque sillas",
    icon: Armchair,
    category: "Foro y prensa",
  },
  { kind: "table", label: "Mesa", icon: Table2, category: "Mobiliario" },
  { kind: "sofa", label: "Sofá", icon: Sofa, category: "Mobiliario" },
  { kind: "wall", label: "Muro", icon: BrickWall, category: "Arquitectura" },
  { kind: "column", label: "Columna", icon: Plus, category: "Arquitectura" },
  { kind: "plant", label: "Planta", icon: Flower2, category: "Arquitectura" },
  { kind: "fountain", label: "Fuente", icon: Waves, category: "Arquitectura" },
  {
    kind: "external_area",
    label: "Área externa",
    icon: Trees,
    category: "Arquitectura",
  },
  { kind: "lobby", label: "Lobby", icon: Maximize2, category: "Arquitectura" },
  {
    kind: "special",
    label: "Área especial",
    icon: Maximize2,
    category: "Avanzado",
  },
  {
    kind: "polygon",
    label: "Dibujar área",
    icon: Pentagon,
    category: "Avanzado",
  },
  { kind: "blank", label: "Espacio libre", icon: Ruler, category: "Avanzado" },
];
const paletteCategories: PaletteCategory[] = [
  "Comercial",
  "Circulación",
  "Servicios",
  "Foro y prensa",
  "Mobiliario",
  "Arquitectura",
  "Avanzado",
];

const kindOf = (item: SceneElement): Kind =>
  (item.metadata.object_type as Kind | undefined) ??
  (item.element_type === "stand"
    ? "stand"
    : item.element_type === "aisle"
      ? "aisle"
      : item.element_type === "stage"
        ? "special"
        : "information");
const dbType = (kind: Kind) =>
  kind === "stand"
    ? "stand"
    : kind === "aisle"
      ? "aisle"
      : kind === "forum" || kind === "special"
        ? "stage"
        : kind === "door" ||
            kind === "access" ||
            kind === "emergency_exit" ||
            kind === "security"
          ? "access_point"
          : "zone";
function parseGeometry(item: Record<string, unknown>): Geometry {
  const raw = item.geometry;
  if (raw && typeof raw === "object") return raw as Geometry;
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  return {
    x: Number(item.x ?? 0),
    y: Number(item.y ?? 0),
    width: Number(item.width ?? 1),
    height: Number(item.height ?? 1),
    rotation: Number(metadata.rotation ?? 0),
  };
}
function standNumber(label: string) {
  const match = label.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}
function rectanglesOverlap(a: Geometry, b: Geometry) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function ExhibitionCanvasEditor({
  mapId,
  eventId,
}: {
  mapId: string;
  eventId: string;
}) {
  const navigate = useNavigate();
  const [elements, setElements] = useState<SceneElement[]>([]);
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [published, setPublished] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Kind | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundPath, setBackgroundPath] = useState<string | null>(null);
  const [backgroundVisible, setBackgroundVisible] = useState(true);
  const [opacity, setOpacity] = useState(65);
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [versions, setVersions] = useState<
    { id: string; version_number: number; label: string; snapshot: Snapshot }[]
  >([]);
  const [polygonDraft, setPolygonDraft] = useState<number[]>([]);
  const [calibrationActive, setCalibrationActive] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<
    { x: number; y: number }[]
  >([]);
  const selected = elements.find((item) => item.id === selectedId) ?? null;
  const companyNames = useMemo(
    () => new Map(companies.map((company) => [company.id, company.name])),
    [companies],
  );
  const assignmentMap = useMemo(
    () =>
      new Map(
        assignments.map((item) => [
          item.element_id,
          companyNames.get(item.company_id) ?? item.company_id,
        ]),
      ),
    [assignments, companyNames],
  );
  const columns = Number(metadata.width_units ?? WORLD.width);
  const rows = Number(metadata.height_units ?? WORLD.height);
  const snapshot = useCallback(
    (): Snapshot => ({
      elements: elements.map((item) => ({
        ...item,
        geometry: {
          ...item.geometry,
          points: item.geometry.points ? [...item.geometry.points] : undefined,
        },
        metadata: { ...item.metadata },
        style: { ...item.style },
      })),
      metadata: { ...metadata },
    }),
    [elements, metadata],
  );
  function remember() {
    setHistory((current) => [...current.slice(-39), snapshot()]);
    setFuture([]);
  }
  async function createVersion(label = "Guardado automático") {
    const [{ data: latest }, { data: map }, { data: currentElements }] =
      await Promise.all([
        supabase
          .from("venue_map_versions")
          .select("version_number")
          .eq("map_id", mapId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("venue_maps")
          .select("metadata,published")
          .eq("id", mapId)
          .single(),
        supabase
          .from("venue_map_elements")
          .select(
            "id,label,element_type,status,x,y,width,height,metadata,geometry,layer,z_index,locked,visible,public_visible,booth_type,area_m2,price,currency,tags,style",
          )
          .eq("map_id", mapId)
          .order("z_index"),
      ]);
    const version =
      Number(latest?.version_number ?? 0) + 1 + (published ? 0 : 0);
    const normalized = (currentElements ?? []).map((raw) => {
      const item = raw as unknown as Record<string, unknown>;
      const itemMetadata =
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : {};
      return {
        ...item,
        geometry: parseGeometry(item),
        layer: String(item.layer ?? itemMetadata.layer ?? "layout"),
        z_index: Number(item.z_index ?? 1),
        locked: Boolean(item.locked),
        visible: item.visible !== false,
        style:
          item.style && typeof item.style === "object"
            ? (item.style as Record<string, unknown>)
            : {},
        metadata: itemMetadata,
      } as unknown as SceneElement;
    });
    const versionSnapshot: Snapshot = {
      elements: normalized,
      metadata: (map?.metadata ?? metadata) as Record<string, unknown>,
    };
    const { data: inserted, error } = await supabase
      .from("venue_map_versions")
      .insert({
        map_id: mapId,
        version_number: version,
        label,
        snapshot: versionSnapshot,
      })
      .select("id")
      .single();
    if (!error && inserted) {
      setVersions((current) =>
        [
          ...current,
          {
            id: inserted.id,
            version_number: version,
            label,
            snapshot: versionSnapshot,
          },
        ].slice(-20),
      );
      await supabase
        .from("venue_maps")
        .update({ current_version: version })
        .eq("id", mapId);
    }
  }
  async function restoreSnapshot(next: Snapshot) {
    setBusy(true);
    const { data: current } = await supabase
      .from("venue_map_elements")
      .select("id")
      .eq("map_id", mapId);
    const keep = new Set(next.elements.map((item) => item.id));
    const removeIds = (current ?? [])
      .map((item) => item.id)
      .filter((id) => !keep.has(id));
    if (removeIds.length)
      await supabase.from("venue_map_elements").delete().in("id", removeIds);
    const rowsToUpsert = next.elements.map((item) => ({
      id: item.id,
      map_id: mapId,
      element_type: item.element_type ?? dbType(kindOf(item)),
      label: item.label,
      status: item.status ?? "blocked",
      x: item.geometry.x,
      y: item.geometry.y,
      width: item.geometry.width,
      height: item.geometry.height,
      geometry: item.geometry,
      metadata: item.metadata,
      layer: item.layer,
      z_index: item.z_index,
      locked: item.locked,
      visible: item.visible,
      public_visible: item.public_visible !== false,
      booth_type: item.booth_type ?? null,
      area_m2:
        kindOf(item) === "stand"
          ? Number((item.geometry.width * item.geometry.height).toFixed(2))
          : (item.area_m2 ?? null),
      price: item.price ?? null,
      currency: item.currency ?? "USD",
      tags: item.tags ?? [],
      style: item.style,
    }));
    if (rowsToUpsert.length)
      await supabase
        .from("venue_map_elements")
        .upsert(rowsToUpsert, { onConflict: "id" });
    await supabase
      .from("venue_maps")
      .update({ metadata: next.metadata })
      .eq("id", mapId);
    setBusy(false);
    setMetadata(next.metadata);
    setElements(next.elements);
    setSelectedId(null);
    setSelectedIds([]);
    setMessage("Versión restaurada.");
  }
  async function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [...current, snapshot()]);
    await restoreSnapshot(previous);
  }
  async function redo() {
    const next = future.at(-1);
    if (!next) return;
    setFuture((current) => current.slice(0, -1));
    setHistory((current) => [...current, snapshot()]);
    await restoreSnapshot(next);
  }

  const load = useCallback(async () => {
    const [
      { data: map, error: mapError },
      { data: event, error: eventError },
      { data: savedVersions },
    ] = await Promise.all([
      supabase
        .from("venue_maps")
        .select("metadata,current_version,published")
        .eq("id", mapId)
        .single(),
      supabase
        .from("events")
        .select("organization_id")
        .eq("id", eventId)
        .single(),
      supabase
        .from("venue_map_versions")
        .select("id,version_number,label,snapshot")
        .eq("map_id", mapId)
        .order("version_number", { ascending: false })
        .limit(20),
    ]);
    if (mapError || eventError || !map) {
      setMessage(
        mapError?.message ??
          eventError?.message ??
          "No se pudo cargar el plano.",
      );
      return;
    }
    const { data, error } = await supabase
      .from("venue_map_elements")
      .select(
        "id,label,element_type,status,x,y,width,height,metadata,geometry,layer,z_index,locked,visible,public_visible,booth_type,area_m2,price,currency,tags,style",
      )
      .eq("map_id", mapId)
      .order("z_index");
    if (error) {
      setMessage(error.message);
      return;
    }
    const nextMetadata = {
      ...(map.metadata ?? {}),
      plan_type: "exhibition_canvas",
      coordinate_system: "metric",
      width_units: Number(map.metadata?.width_units ?? WORLD.width),
      height_units: Number(map.metadata?.height_units ?? WORLD.height),
      snap_step: Number(map.metadata?.snap_step ?? 1),
    };
    setMetadata(nextMetadata);
    setPublished(Boolean(map.published));
    setVersions(
      (savedVersions ?? []) as {
        id: string;
        version_number: number;
        label: string;
        snapshot: Snapshot;
      }[],
    );
    if (JSON.stringify(map.metadata ?? {}) !== JSON.stringify(nextMetadata))
      await supabase
        .from("venue_maps")
        .update({ metadata: nextMetadata })
        .eq("id", mapId);
    const normalized = (data ?? []).map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      const itemMetadata =
        raw.metadata && typeof raw.metadata === "object"
          ? (raw.metadata as Record<string, unknown>)
          : {};
      const elementType = String(raw.element_type ?? "zone");
      return {
        ...raw,
        geometry: parseGeometry(raw),
        layer: String(
          raw.layer ??
            itemMetadata.layer ??
            (elementType === "stand" ? "layout" : "architecture"),
        ),
        z_index: Number(raw.z_index ?? itemMetadata.z_index ?? 1),
        locked: Boolean(raw.locked ?? itemMetadata.locked),
        visible: raw.visible !== false && itemMetadata.visible !== false,
        style:
          raw.style && typeof raw.style === "object"
            ? (raw.style as Record<string, unknown>)
            : { fill: itemMetadata.color ?? "#e2e8f0" },
        metadata: itemMetadata,
      } as unknown as SceneElement;
    });
    setElements(normalized);
    setSelectedId((current) =>
      normalized.some((item) => item.id === current) ? current : null,
    );
    setSelectedIds((current) =>
      current.filter((id) => normalized.some((item) => item.id === id)),
    );
    if (event?.organization_id) {
      const [firms, booth] = await Promise.all([
        supabase
          .from("companies")
          .select("id,name")
          .eq("organization_id", event.organization_id)
          .eq("kind", "exhibitor")
          .order("name"),
        supabase
          .from("booth_assignments")
          .select("element_id,company_id")
          .neq("status", "cancelled"),
      ]);
      setCompanies((firms.data ?? []) as Company[]);
      setAssignments((booth.data ?? []) as Assignment[]);
    }
    const path = nextMetadata.background_path as string | undefined;
    setBackgroundPath(path ?? null);
    setBackgroundVisible(nextMetadata.background_visible !== false);
    if (path) {
      const signed = await supabase.storage
        .from("agenda-attachments")
        .createSignedUrl(path, 3600);
      if (!signed.error) {
        const url = signed.data.signedUrl;
        const mime = String(nextMetadata.background_mime ?? "");
        if (mime.includes("pdf") || mime.includes("dxf")) {
          const buffer = await fetch(url).then((response) =>
            response.arrayBuffer(),
          );
          setBackgroundUrl(await renderBlueprint(buffer, mime));
        } else setBackgroundUrl(url);
      }
    }
  }, [eventId, mapId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function persist(item: SceneElement) {
    const g = item.geometry;
    const nextMetadata = { ...item.metadata, object_type: kindOf(item) };
    const area =
      kindOf(item) === "stand"
        ? Number((g.width * g.height).toFixed(2))
        : (item.area_m2 ?? null);
    const { error } = await supabase
      .from("venue_map_elements")
      .update({
        label: item.label,
        status:
          item.status ?? (kindOf(item) === "stand" ? "available" : "blocked"),
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        geometry: g,
        layer: item.layer,
        z_index: item.z_index,
        locked: item.locked,
        visible: item.visible,
        public_visible: item.public_visible !== false,
        booth_type: item.booth_type ?? null,
        area_m2: area,
        price: item.price ?? null,
        currency: item.currency ?? "USD",
        tags: item.tags ?? [],
        style: item.style,
        metadata: nextMetadata,
      })
      .eq("id", item.id);
    if (error) setMessage(error.message);
  }
  function selectElement(item: SceneElement, additive: boolean) {
    setSelectedIds((current) =>
      additive
        ? current.includes(item.id)
          ? current.filter((id) => id !== item.id)
          : [...current, item.id]
        : [item.id],
    );
    setSelectedId(item.id);
  }
  async function moveSelection(sourceId: string, x: number, y: number) {
    const source = elements.find((item) => item.id === sourceId);
    if (!source) return;
    const ids = selectedIds.includes(sourceId) ? selectedIds : [sourceId];
    const dx = x - source.geometry.x;
    const dy = y - source.geometry.y;
    remember();
    const nextItems = elements
      .filter((item) => ids.includes(item.id) && !item.locked)
      .map((item) => ({
        ...item,
        geometry: {
          ...item.geometry,
          x: Math.max(
            0,
            Math.min(columns - item.geometry.width, item.geometry.x + dx),
          ),
          y: Math.max(
            0,
            Math.min(rows - item.geometry.height, item.geometry.y + dy),
          ),
        },
      }));
    setElements((current) =>
      current.map(
        (item) => nextItems.find((next) => next.id === item.id) ?? item,
      ),
    );
    await Promise.all(nextItems.map((item) => persist(item)));
    await createVersion();
  }
  async function addAt(kind: Kind, x: number, y: number) {
    const preset = DEFAULTS[kind];
    const count =
      kind === "stand"
        ? Math.max(
            0,
            ...elements
              .filter((item) => kindOf(item) === "stand")
              .map((item) => standNumber(item.label) ?? 0),
          ) + 1
        : elements.filter((item) => kindOf(item) === kind).length + 1;
    const geometry = {
      x: Math.max(0, Math.min(x, columns - preset.width)),
      y: Math.max(0, Math.min(y, rows - preset.height)),
      width: preset.width,
      height: preset.height,
      rotation: 0,
      shape: "rect" as const,
    };
    const payload = {
      map_id: mapId,
      element_type: dbType(kind),
      label: `${preset.label} ${count}`,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      status: kind === "stand" ? "available" : "blocked",
      geometry,
      area_m2:
        kind === "stand"
          ? Number((geometry.width * geometry.height).toFixed(2))
          : null,
      layer: preset.layer,
      z_index: kind === "stand" ? 20 : 10,
      locked: false,
      visible: true,
      style: { fill: preset.color },
      metadata: {
        floorplan_kind: kind === "stand" ? "stand" : "object",
        object_type: kind,
        purpose: preset.label,
      },
    };
    remember();
    setBusy(true);
    const { data, error } = await supabase
      .from("venue_map_elements")
      .insert(payload)
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      setMessage(error?.message ?? "No se pudo añadir el elemento.");
      return;
    }
    const inserted = { ...payload, id: data.id } as unknown as SceneElement;
    setElements((current) => [...current, inserted]);
    setTool(null);
    setSelectedId(data.id);
    setSelectedIds([data.id]);
    setMessage(`${preset.label} añadido. Guardando en el plano…`);
    window.setTimeout(() => {
      void load();
    }, 1800);
    await createVersion();
  }
  async function duplicateStand() {
    if (!selected || kindOf(selected) !== "stand" || busy) return;
    const occupied = elements
      .filter((item) => item.visible && kindOf(item) === "stand")
      .map((item) => item.geometry);
    const step = 0.5;
    const candidates: Geometry[] = [];
    candidates.push({
      ...selected.geometry,
      x: selected.geometry.x + selected.geometry.width + step,
    });
    for (let y = 0; y <= rows - selected.geometry.height; y += step)
      for (let x = 0; x <= columns - selected.geometry.width; x += step)
        candidates.push({ ...selected.geometry, x, y });
    const geometry = candidates.find(
      (candidate) =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x + candidate.width <= columns &&
        candidate.y + candidate.height <= rows &&
        !occupied.some((item) => rectanglesOverlap(candidate, item)),
    );
    if (!geometry) {
      setMessage(
        "No hay espacio libre en el plano para duplicar este stand sin superponerlo.",
      );
      return;
    }
    const nextNumber =
      Math.max(
        0,
        ...elements
          .filter((item) => kindOf(item) === "stand")
          .map((item) => standNumber(item.label) ?? 0),
      ) + 1;
    const payload = {
      map_id: mapId,
      element_type: "stand",
      label: `Stand ${nextNumber}`,
      status: "available",
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      geometry,
      layer: selected.layer,
      z_index: selected.z_index,
      locked: false,
      visible: selected.visible,
      public_visible: selected.public_visible !== false,
      booth_type: selected.booth_type ?? null,
      area_m2: Number((geometry.width * geometry.height).toFixed(2)),
      price: selected.price ?? null,
      currency: selected.currency ?? "USD",
      tags: selected.tags ?? [],
      style: selected.style,
      metadata: {
        ...selected.metadata,
        floorplan_kind: "stand",
        object_type: "stand",
      },
    };
    remember();
    setBusy(true);
    const { data, error } = await supabase
      .from("venue_map_elements")
      .insert(payload)
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      setMessage(error?.message ?? "No se pudo duplicar el stand.");
      return;
    }
    const inserted = { ...payload, id: data.id } as SceneElement;
    setElements((current) => [...current, inserted]);
    setSelectedId(data.id);
    setSelectedIds([data.id]);
    setMessage(
      `${inserted.label} duplicado con medidas ${geometry.width} m × ${geometry.height} m.`,
    );
    await createVersion("Stand duplicado");
  }
  async function addPolygon(points: number[]) {
    if (points.length < 6) return;
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const width = Math.max(0.5, maxX - minX);
    const height = Math.max(0.5, maxY - minY);
    const normalized = points.map((value, index) =>
      index % 2 === 0 ? (value - minX) / width : (value - minY) / height,
    );
    const count =
      elements.filter((item) => kindOf(item) === "polygon").length + 1;
    const geometry = {
      x: minX,
      y: minY,
      width,
      height,
      rotation: 0,
      shape: "polygon" as const,
      points: normalized,
    };
    const payload = {
      map_id: mapId,
      element_type: "zone",
      label: `Área irregular ${count}`,
      x: minX,
      y: minY,
      width,
      height,
      status: "blocked",
      geometry,
      layer: "layout",
      z_index: 12,
      locked: false,
      visible: true,
      style: { fill: DEFAULTS.polygon.color },
      metadata: {
        floorplan_kind: "object",
        object_type: "polygon",
        purpose: "Área irregular",
      },
    };
    remember();
    setBusy(true);
    const { data, error } = await supabase
      .from("venue_map_elements")
      .insert(payload)
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      setMessage(error?.message ?? "No se pudo crear el área irregular.");
      return;
    }
    setPolygonDraft([]);
    setTool(null);
    setSelectedId(data.id);
    setSelectedIds([data.id]);
    await load();
    await createVersion("Área irregular creada");
  }
  async function removeSelected() {
    const ids = selectedIds.length
      ? selectedIds
      : selected
        ? [selected.id]
        : [];
    const deletable = elements.filter(
      (item) => ids.includes(item.id) && !item.locked,
    );
    if (
      !deletable.length ||
      !window.confirm(
        `¿Eliminar ${deletable.length} elemento(s) seleccionado(s)?`,
      )
    )
      return;
    remember();
    const { error } = await supabase
      .from("venue_map_elements")
      .delete()
      .in(
        "id",
        deletable.map((item) => item.id),
      );
    if (error) setMessage(error.message);
    else {
      setSelectedId(null);
      setSelectedIds([]);
      await load();
      await createVersion("Elementos eliminados");
    }
  }
  async function removePlan() {
    if (
      busy ||
      !window.confirm(
        "¿Eliminar el plano completo, sus stands, objetos y asignaciones? El evento se conservará.",
      )
    )
      return;
    setBusy(true);
    setMessage("Eliminando plano…");
    const { data, error } = await supabase.rpc("delete_floor_plan", {
      p_map_id: mapId,
    });
    if (error || data !== true) {
      setMessage(
        error?.message ?? "No se pudo confirmar la eliminación del plano.",
      );
      setBusy(false);
      return;
    }
    navigate(`/admin/eventos/${eventId}/administrar`, { replace: true });
  }
  async function updateSelected(change: Partial<SceneElement>) {
    if (!selected) return;
    remember();
    const rawGeometry = { ...selected.geometry, ...(change.geometry ?? {}) };
    const geometry = {
      ...rawGeometry,
      width: Math.max(0.1, Math.min(columns, rawGeometry.width)),
      height: Math.max(0.1, Math.min(rows, rawGeometry.height)),
      x: Math.max(
        0,
        Math.min(columns - Math.min(columns, rawGeometry.width), rawGeometry.x),
      ),
      y: Math.max(
        0,
        Math.min(rows - Math.min(rows, rawGeometry.height), rawGeometry.y),
      ),
    };
    const next = {
      ...selected,
      ...change,
      geometry,
      area_m2:
        kindOf(selected) === "stand"
          ? Number((geometry.width * geometry.height).toFixed(2))
          : (change.area_m2 ?? selected.area_m2),
    };
    setElements((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );
    await persist(next);
    await createVersion("Propiedad modificada");
  }
  async function editStandNumber(item: SceneElement) {
    if (kindOf(item) !== "stand") return;
    const value = window.prompt(
      "Número del stand:",
      String(standNumber(item.label) ?? ""),
    );
    if (value === null) return;
    const number = Number(value.trim());
    if (!Number.isInteger(number) || number < 1) {
      setMessage("El número del stand debe ser un entero mayor que cero.");
      return;
    }
    const label = `Stand ${number}`;
    if (
      elements.some(
        (candidate) =>
          candidate.id !== item.id &&
          candidate.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
      )
    ) {
      setMessage(`${label} ya existe en este plano.`);
      return;
    }
    setSelectedId(item.id);
    setSelectedIds([item.id]);
    remember();
    const next = { ...item, label };
    setElements((current) =>
      current.map((candidate) => (candidate.id === item.id ? next : candidate)),
    );
    await persist(next);
    await createVersion("Número de stand actualizado");
    setMessage(`${label} guardado.`);
  }
  async function changeStandStatus(status: string) {
    if (!selected || kindOf(selected) !== "stand") return;
    const assignment = assignments.find(
      (item) => item.element_id === selected.id,
    );
    if ((status === "available" || status === "blocked") && assignment) {
      const { error } = await supabase
        .from("booth_assignments")
        .delete()
        .eq("element_id", selected.id);
      if (error) {
        setMessage(error.message);
        return;
      }
      setAssignments((items) =>
        items.filter((item) => item.element_id !== selected.id),
      );
    } else if (assignment) {
      const { error } = await supabase
        .from("booth_assignments")
        .update({ status: status === "assigned" ? "confirmed" : "reserved" })
        .eq("element_id", selected.id);
      if (error) {
        setMessage(error.message);
        return;
      }
    }
    await updateSelected({ status });
    setMessage(
      status === "available"
        ? "Stand disponible."
        : status === "reserved"
          ? "Stand reservado."
          : status === "assigned"
            ? "Stand asignado."
            : "Stand bloqueado.",
    );
  }
  async function assign(companyId: string) {
    if (!selected || kindOf(selected) !== "stand") return;
    if (!companyId) {
      await release();
      return;
    }
    const { error } = await supabase
      .from("booth_assignments")
      .upsert(
        { element_id: selected.id, company_id: companyId, status: "confirmed" },
        { onConflict: "element_id" },
      );
    if (error) setMessage(error.message);
    else {
      await supabase
        .from("venue_map_elements")
        .update({ status: "assigned" })
        .eq("id", selected.id);
      setAssignments((items) => [
        ...items.filter((item) => item.element_id !== selected.id),
        { element_id: selected.id, company_id: companyId },
      ]);
      setElements((items) =>
        items.map((item) =>
          item.id === selected.id ? { ...item, status: "assigned" } : item,
        ),
      );
      setMessage("Empresa expositora asignada y stand marcado como asignado.");
    }
  }
  async function release() {
    if (!selected) return;
    const { error } = await supabase
      .from("booth_assignments")
      .delete()
      .eq("element_id", selected.id);
    if (error) setMessage(error.message);
    else {
      await supabase
        .from("venue_map_elements")
        .update({ status: "available" })
        .eq("id", selected.id);
      setAssignments((items) =>
        items.filter((item) => item.element_id !== selected.id),
      );
      setMessage("Stand liberado.");
      await load();
    }
  }
  async function toggleBackground(visible: boolean) {
    const next = { ...metadata, background_visible: visible };
    setBackgroundVisible(visible);
    setMetadata(next);
    await supabase
      .from("venue_maps")
      .update({ metadata: next })
      .eq("id", mapId);
    await createVersion("Visibilidad del blueprint");
  }
  function startCalibration() {
    setTool(null);
    setPolygonDraft([]);
    setSelectedId(null);
    setSelectedIds([]);
    setCalibrationPoints([]);
    setCalibrationActive(true);
    setMessage(
      "Calibración: marca la primera esquina del stand impreso en el blueprint.",
    );
  }
  function cancelCalibration() {
    setCalibrationActive(false);
    setCalibrationPoints([]);
    setMessage("Calibración cancelada.");
  }
  function addCalibrationPoint(point: { x: number; y: number }) {
    setCalibrationPoints((current) => {
      if (!current.length) {
        setMessage("Ahora marca la esquina opuesta del mismo stand.");
        return [point];
      }
      setCalibrationActive(false);
      setMessage(
        "Referencia medida. Introduce sus dimensiones reales y revisa el cálculo antes de aplicarlo.",
      );
      return [current[0], point];
    });
  }
  async function resizePlan(width: number, height: number) {
    const requiredWidth = Math.max(
      0,
      ...elements.map((item) => item.geometry.x + item.geometry.width),
    );
    const requiredHeight = Math.max(
      0,
      ...elements.map((item) => item.geometry.y + item.geometry.height),
    );
    if (width < requiredWidth || height < requiredHeight) {
      setMessage(
        `El plano debe medir al menos ${requiredWidth.toFixed(1)} m × ${requiredHeight.toFixed(1)} m para contener los elementos actuales.`,
      );
      return;
    }
    const next = {
      ...metadata,
      width_units: width,
      height_units: height,
      grid_columns: width,
      grid_rows: height,
      coordinate_system: "metric",
    };
    remember();
    setMetadata(next);
    const { error } = await supabase
      .from("venue_maps")
      .update({ metadata: next })
      .eq("id", mapId);
    if (error) {
      setMetadata(metadata);
      setMessage(error.message);
      return;
    }
    await createVersion("Escala métrica del blueprint actualizada");
    setCalibrationPoints([]);
    setCalibrationActive(false);
    setMessage(`Blueprint calibrado a ${width} m × ${height} m.`);
  }
  async function uploadBackground(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${String(metadata.organization_id ?? "org")}/${eventId}/map-${mapId}/background-${Date.now()}.${ext}`;
    remember();
    setBusy(true);
    const { error } = await supabase.storage
      .from("agenda-attachments")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const next = {
        ...metadata,
        background_path: path,
        background_name: file.name,
        background_mime: file.type || `application/${ext}`,
        background_visible: true,
      };
      await supabase
        .from("venue_maps")
        .update({ metadata: next })
        .eq("id", mapId);
      setMetadata(next);
      setBackgroundPath(path);
      setBackgroundVisible(true);
      const signed = await supabase.storage
        .from("agenda-attachments")
        .createSignedUrl(path, 3600);
      if (signed.data?.signedUrl)
        setBackgroundUrl(await renderBlueprint(file, file.type || ext));
      setMessage(
        "Plano base cargado. Puedes ocultarlo desde el control de blueprint.",
      );
      await createVersion("Blueprint actualizado");
    } else setMessage(error.message);
    setBusy(false);
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[220px_1fr_280px]">
      <aside className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Biblioteca</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Selecciona un objeto y haz clic en el plano para colocarlo.
        </p>
        <div className="mt-4 space-y-2">
          {paletteCategories.map((category) => (
            <details
              key={category}
              open={category === "Comercial" || category === "Circulación"}
              className="rounded-lg border bg-zinc-50"
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-zinc-700">
                {category}
              </summary>
              <div className="grid grid-cols-2 gap-2 border-t p-2">
                {palette
                  .filter((item) => item.category === category)
                  .map(({ kind, label, icon: Icon }) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        setTool(tool === kind ? null : kind);
                        setPolygonDraft([]);
                      }}
                      className={`flex items-center gap-1 rounded-lg border p-2 text-left text-[11px] font-semibold ${tool === kind ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "bg-white"}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </button>
                  ))}
              </div>
            </details>
          ))}
        </div>
        <label className="mt-5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-xs font-semibold">
          <FileUp className="h-4 w-4" />
          Cargar blueprint
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.svg,.dxf"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadBackground(file);
            }}
          />
        </label>
        <p className="mt-2 text-[11px] text-zinc-500">
          PDF, PNG, JPG, SVG o DXF. El archivo queda como referencia del
          diseñador.
        </p>
        <PlanScaleEditor
          width={columns}
          height={rows}
          measuredWidth={
            calibrationPoints.length === 2
              ? Math.abs(calibrationPoints[1].x - calibrationPoints[0].x)
              : null
          }
          measuredHeight={
            calibrationPoints.length === 2
              ? Math.abs(calibrationPoints[1].y - calibrationPoints[0].y)
              : null
          }
          pointCount={calibrationPoints.length}
          active={calibrationActive}
          onStart={startCalibration}
          onCancel={cancelCalibration}
          onCommit={resizePlan}
        />
        <div className="mt-4 space-y-2 text-xs">
          <label className="flex items-center justify-between">
            Mostrar rejilla
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => setShowGrid(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            Mostrar cotas
            <input
              type="checkbox"
              checked={showDimensions}
              onChange={(event) => setShowDimensions(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            Snap
            <input
              type="checkbox"
              checked={snap}
              onChange={(event) => setSnap(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            Blueprint
            <input
              type="checkbox"
              checked={backgroundVisible}
              disabled={!backgroundUrl}
              onChange={(event) => void toggleBackground(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            Opacidad
            <input
              type="range"
              min="15"
              max="100"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
          <b>Área irregular:</b> selecciona “Dibujar área”, haz clic en cada
          vértice y doble clic para cerrar.
        </div>
      </aside>
      <main>
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 text-xs">
          <span className="font-semibold">
            Canvas a escala: {columns} × {rows} m
          </span>
          <span className="text-zinc-500">{elements.length} elementos</span>
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!history.length || busy}
            className="rounded border p-1.5 disabled:opacity-40"
            title="Deshacer"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void redo()}
            disabled={!future.length || busy}
            className="rounded border p-1.5 disabled:opacity-40"
            title="Rehacer"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void createVersion("Versión manual")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 font-semibold"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar versión
          </button>
          {versions.length > 0 && (
            <select
              className="rounded border px-2 py-1"
              value=""
              onChange={(event) => {
                const version = versions.find(
                  (item) => item.id === event.target.value,
                );
                if (
                  version &&
                  window.confirm(
                    `¿Restaurar la versión ${version.version_number}?`,
                  )
                )
                  void restoreSnapshot(version.snapshot);
              }}
            >
              <option value="">Historial ({versions.length})</option>
              {versions
                .slice()
                .reverse()
                .map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.version_number} · {version.label}
                  </option>
                ))}
            </select>
          )}
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => void removeSelected()}
              className="rounded border border-red-200 px-2 py-1 font-semibold text-red-700"
            >
              Eliminar {selectedIds.length}
            </button>
          )}
          {tool && (
            <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
              {tool === "polygon"
                ? "Dibujando área irregular"
                : `Colocando: ${DEFAULTS[tool].label}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void removePlan()}
            className="ml-auto rounded border border-red-200 px-2 py-1 font-semibold text-red-700"
          >
            Eliminar plano
          </button>
          <button
            type="button"
            onClick={() => setShowGrid((value) => !value)}
            className="rounded border p-1.5"
            title="Mostrar u ocultar rejilla"
          >
            {showGrid ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="overflow-auto rounded-2xl border bg-slate-100 p-3">
          <ExhibitionKonvaStage
            columns={columns}
            rows={rows}
            elements={elements}
            assignments={assignmentMap}
            selectedIds={selectedIds}
            showGrid={showGrid}
            showDimensions={showDimensions}
            snap={snap}
            backgroundUrl={backgroundVisible ? backgroundUrl : null}
            opacity={opacity}
            tool={tool}
            polygonDraft={polygonDraft}
            calibrationActive={calibrationActive}
            calibrationPoints={calibrationPoints}
            onCalibrationPoint={addCalibrationPoint}
            onPolygonPoint={(x, y) =>
              setPolygonDraft((current) => [...current, x, y])
            }
            onPolygonFinish={() => void addPolygon(polygonDraft)}
            onSelect={selectElement}
            onEditLabel={(item) => void editStandNumber(item)}
            onClear={() => {
              setSelectedId(null);
              setSelectedIds([]);
              setTool(null);
              setPolygonDraft([]);
            }}
            onPlace={(x, y) => {
              if (tool && tool !== "polygon") void addAt(tool, x, y);
            }}
            onMove={moveSelection}
            onTransform={(id, geometry) => {
              const item = elements.find((candidate) => candidate.id === id);
              if (item) void updateSelected({ ...item, geometry });
            }}
          />
        </div>
        {message && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            {message}
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Arrastra, redimensiona y rota. Doble clic sobre un stand edita su
          número. Ctrl/Cmd + clic permite seleccionar varios elementos.
        </p>
      </main>
      <aside className="h-fit rounded-2xl border bg-white p-4">
        {selected ? (
          <Inspector
            item={selected}
            companies={companies}
            assignment={
              assignments.find((item) => item.element_id === selected.id)
                ?.company_id ?? ""
            }
            onChange={updateSelected}
            onAssign={assign}
            onRelease={release}
            onDelete={removeSelected}
            onDuplicate={duplicateStand}
            onStatus={changeStandStatus}
            onEditNumber={() => void editStandNumber(selected)}
          />
        ) : (
          <div className="text-sm text-zinc-600">
            <h2 className="font-semibold text-zinc-900">Inspector</h2>
            <p className="mt-2">
              Selecciona un elemento para editar posición, tamaño, rotación,
              capa o empresa.
            </p>
            {backgroundPath && (
              <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
                Blueprint: {String(metadata.background_name ?? "")}
              </p>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}

function Inspector({
  item,
  companies,
  assignment,
  onChange,
  onAssign,
  onRelease,
  onDelete,
  onDuplicate,
  onStatus,
  onEditNumber,
}: {
  item: SceneElement;
  companies: Company[];
  assignment: string;
  onChange: (change: Partial<SceneElement>) => void;
  onAssign: (id: string) => void;
  onRelease: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onStatus: (status: string) => void;
  onEditNumber: () => void;
}) {
  const kind = kindOf(item);
  const isStand = kind === "stand";
  const area = Number((item.geometry.width * item.geometry.height).toFixed(2));
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{item.label}</h2>
          <p className="text-xs text-zinc-500">
            {DEFAULTS[kind]?.label ?? kind}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-red-200 p-1 text-red-700"
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {isStand && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300 px-2 py-2 text-xs font-semibold text-emerald-800"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicar
          </button>
          <button
            type="button"
            onClick={onEditNumber}
            className="rounded-lg border border-zinc-300 px-2 py-2 text-xs font-semibold text-zinc-700"
          >
            Editar número
          </button>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <label>
          X (m)
          <input
            type="number"
            step="0.1"
            value={item.geometry.x}
            onChange={(event) =>
              onChange({
                geometry: { ...item.geometry, x: Number(event.target.value) },
              })
            }
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label>
          Y (m)
          <input
            type="number"
            step="0.1"
            value={item.geometry.y}
            onChange={(event) =>
              onChange({
                geometry: { ...item.geometry, y: Number(event.target.value) },
              })
            }
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label>
          Ancho (m)
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={item.geometry.width}
            onChange={(event) =>
              onChange({
                geometry: {
                  ...item.geometry,
                  width: Number(event.target.value),
                },
              })
            }
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label>
          Alto (m)
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={item.geometry.height}
            onChange={(event) =>
              onChange({
                geometry: {
                  ...item.geometry,
                  height: Number(event.target.value),
                },
              })
            }
            className="mt-1 w-full rounded border p-2"
          />
        </label>
      </div>
      {isStand && (
        <>
          <DimensionEditor item={item} onChange={onChange} />
          <div className="mt-3 rounded-lg bg-emerald-50 p-3">
            <div className="flex items-center gap-2">
              <span
                className="h-5 w-5 rounded border border-slate-400"
                style={{
                  backgroundColor: standSizeColor(
                    item.geometry.width,
                    item.geometry.height,
                  ),
                }}
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Área calculada
                </p>
                <p className="text-[10px] text-emerald-800">
                  Color automático para {item.geometry.width} ×{" "}
                  {item.geometry.height} m
                </p>
              </div>
            </div>
            <p className="mt-1 text-lg font-bold text-emerald-950">
              {area.toLocaleString("es-VE", { maximumFractionDigits: 2 })} m²
            </p>
            <p className="text-[11px] text-emerald-800">
              La medida usa la misma escala métrica del blueprint.
            </p>
          </div>
        </>
      )}
      <label className="mt-3 block text-xs">
        Rotación
        <input
          type="number"
          step="15"
          value={item.geometry.rotation ?? 0}
          onChange={(event) =>
            onChange({
              geometry: {
                ...item.geometry,
                rotation: Number(event.target.value),
              },
            })
          }
          className="mt-1 w-full rounded border p-2"
        />
      </label>
      {!isStand && (
        <label className="mt-3 block text-xs">
          Etiqueta
          <input
            value={item.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className="mt-1 w-full rounded border p-2"
          />
        </label>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={item.locked}
          onChange={(event) => onChange({ locked: event.target.checked })}
        />
        {item.locked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Unlock className="h-3.5 w-3.5" />
        )}{" "}
        Bloquear elemento
      </label>
      {isStand && (
        <>
          <label className="mt-3 block text-xs">
            Estado
            <select
              value={item.status ?? "available"}
              onChange={(event) => void onStatus(event.target.value)}
              className="mt-1 w-full rounded border p-2"
            >
              <option value="available">Disponible</option>
              <option value="reserved">Reservado</option>
              <option value="assigned">Asignado</option>
              <option value="blocked">Bloqueado</option>
            </select>
          </label>
          <label className="mt-3 block text-xs">
            Empresa expositora
            <select
              value={assignment}
              onChange={(event) => void onAssign(event.target.value)}
              className="mt-1 w-full rounded border p-2"
            >
              <option value="">Sin empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          {assignment && (
            <button
              type="button"
              onClick={onRelease}
              className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
            >
              <Unlock className="h-3 w-3" />
              Liberar empresa
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PlanScaleEditor({
  width,
  height,
  measuredWidth,
  measuredHeight,
  pointCount,
  active,
  onStart,
  onCancel,
  onCommit,
}: {
  width: number;
  height: number;
  measuredWidth: number | null;
  measuredHeight: number | null;
  pointCount: number;
  active: boolean;
  onStart: () => void;
  onCancel: () => void;
  onCommit: (width: number, height: number) => void;
}) {
  const [sourceWidth, setSourceWidth] = useState(String(width));
  const [sourceHeight, setSourceHeight] = useState(String(height));
  const [realWidth, setRealWidth] = useState("4");
  const [realHeight, setRealHeight] = useState("4");
  const [observedWidth, setObservedWidth] = useState("2.8");
  const [observedHeight, setObservedHeight] = useState("2.8");
  useEffect(() => {
    setSourceWidth(String(width));
    setSourceHeight(String(height));
  }, [width, height]);
  useEffect(() => {
    if (measuredWidth && measuredHeight) {
      setObservedWidth(measuredWidth.toFixed(2));
      setObservedHeight(measuredHeight.toFixed(2));
    }
  }, [measuredWidth, measuredHeight]);
  const initialWidth = Number(sourceWidth.replace(",", "."));
  const initialHeight = Number(sourceHeight.replace(",", "."));
  const desiredWidth = Number(realWidth.replace(",", "."));
  const desiredHeight = Number(realHeight.replace(",", "."));
  const observedX = Number(observedWidth.replace(",", "."));
  const observedY = Number(observedHeight.replace(",", "."));
  const valid =
    initialWidth > 0 &&
    initialHeight > 0 &&
    desiredWidth > 0 &&
    desiredHeight > 0 &&
    observedX > 0 &&
    observedY > 0;
  const factorX = valid ? desiredWidth / observedX : 0;
  const factorY = valid ? desiredHeight / observedY : 0;
  const factor = valid ? (factorX + factorY) / 2 : 0;
  const factorsSimilar =
    valid && Math.abs(factorX - factorY) / Math.max(factorX, factorY) <= 0.1;
  const correctedWidth = initialWidth * factor;
  const correctedHeight = initialHeight * factor;
  const increase = (factor - 1) * 100;
  function applyScale() {
    if (!valid) return;
    const nextWidth = Number(correctedWidth.toFixed(1));
    const nextHeight = Number(correctedHeight.toFixed(1));
    onCommit(nextWidth, nextHeight);
    setSourceWidth(String(nextWidth));
    setSourceHeight(String(nextHeight));
    setObservedWidth(realWidth);
    setObservedHeight(realHeight);
  }
  const inputClass = "mt-1 w-full rounded border p-1.5 text-xs font-normal";
  return (
    <details
      className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3"
      open
    >
      <summary className="cursor-pointer text-xs font-semibold text-emerald-900">
        Calculadora de escala
      </summary>
      <ol className="mt-2 space-y-1 text-[11px] text-emerald-900">
        <li>
          <b>1.</b> Marca dos esquinas opuestas de un stand conocido.
        </li>
        <li>
          <b>2.</b> Indica sus dimensiones reales.
        </li>
        <li>
          <b>3.</b> Revisa y aplica la corrección.
        </li>
      </ol>
      <button
        type="button"
        onClick={active ? onCancel : onStart}
        className={`mt-3 w-full rounded-md px-2 py-2 text-xs font-semibold text-white ${active ? "bg-red-700" : "bg-slate-800"}`}
      >
        {active
          ? "Cancelar medición"
          : measuredWidth && measuredHeight
            ? "Volver a medir en el plano"
            : "Medir referencia en el plano"}
      </button>
      {active && (
        <p className="mt-2 rounded bg-red-50 p-2 text-[11px] font-semibold text-red-800">
          {pointCount === 1
            ? "Marca la esquina opuesta."
            : "Marca la primera esquina del stand impreso."}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px]">
          Ancho plano (m)
          <input
            inputMode="decimal"
            value={sourceWidth}
            onChange={(event) => setSourceWidth(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-[11px]">
          Alto plano (m)
          <input
            inputMode="decimal"
            value={sourceHeight}
            onChange={(event) => setSourceHeight(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-[11px]">
          Ancho real (m)
          <input
            inputMode="decimal"
            value={realWidth}
            onChange={(event) => setRealWidth(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-[11px]">
          Alto real (m)
          <input
            inputMode="decimal"
            value={realHeight}
            onChange={(event) => setRealHeight(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-[11px]">
          Ancho medido (m)
          <input
            inputMode="decimal"
            value={observedWidth}
            onChange={(event) => setObservedWidth(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-[11px]">
          Alto medido (m)
          <input
            inputMode="decimal"
            value={observedHeight}
            onChange={(event) => setObservedHeight(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {valid ? (
        <div className="mt-3 rounded-md bg-white p-2 text-[11px] text-slate-700">
          <p>
            Factor X: <b>{factorX.toFixed(4)}</b> · Factor Y:{" "}
            <b>{factorY.toFixed(4)}</b>
          </p>
          <p className="mt-1">
            Factor final: <b>{factor.toFixed(4)}</b> · Variación:{" "}
            <b>
              {increase >= 0 ? "+" : ""}
              {increase.toFixed(2)} %
            </b>
          </p>
          <p className="mt-1">
            Antes:{" "}
            <b>
              {initialWidth.toFixed(1)} × {initialHeight.toFixed(1)} m
            </b>
          </p>
          <p>
            Después:{" "}
            <b>
              {correctedWidth.toFixed(1)} × {correctedHeight.toFixed(1)} m
            </b>
          </p>
          {!factorsSimilar && (
            <p className="mt-2 rounded bg-amber-50 p-1.5 font-semibold text-amber-800">
              Los factores X/Y difieren más de 10 %. Revisa las esquinas o la
              proporción del archivo.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-red-700">
          Completa valores mayores que cero.
        </p>
      )}
      <button
        type="button"
        disabled={!valid}
        onClick={applyScale}
        className="mt-2 w-full rounded-md bg-emerald-700 px-2 py-2 text-xs font-semibold text-white disabled:opacity-40"
      >
        Aplicar corrección al blueprint
      </button>
    </details>
  );
}

function DimensionEditor({
  item,
  onChange,
}: {
  item: SceneElement;
  onChange: (change: Partial<SceneElement>) => void;
}) {
  const formatted = `${item.geometry.width} m × ${item.geometry.height} m`;
  const [value, setValue] = useState(formatted);
  const [error, setError] = useState("");
  useEffect(() => {
    setValue(formatted);
    setError("");
  }, [formatted]);
  function commit() {
    const match = value
      .trim()
      .replace(/,/g, ".")
      .match(/^(\d+(?:\.\d+)?)\s*m?\s*[x×]\s*(\d+(?:\.\d+)?)\s*m?$/i);
    if (!match) {
      setError("Usa el formato 4 m × 4 m.");
      return;
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width <= 0 || height <= 0) {
      setError("Las medidas deben ser mayores que cero.");
      return;
    }
    setError("");
    onChange({
      geometry: { ...item.geometry, width, height },
      area_m2: Number((width * height).toFixed(2)),
    });
  }
  return (
    <label className="mt-3 block text-xs">
      Tamaño del stand
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        placeholder="4 m × 4 m"
        className="mt-1 w-full rounded border p-2"
      />
      {error && (
        <span className="mt-1 block text-[11px] text-red-700">{error}</span>
      )}
    </label>
  );
}
