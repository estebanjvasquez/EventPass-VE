import { useEffect, useMemo, useRef, useState } from "react";
import {
  Arc,
  Arrow,
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import { Maximize2, Minus, Plus } from "lucide-react";
import { standSizeColor } from "./standSizeColor";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shape?: "rect" | "polygon";
  points?: number[];
};
export type SceneElement = {
  id: string;
  label: string;
  element_type?: string;
  status?: string;
  geometry: Geometry;
  layer: string;
  z_index: number;
  locked: boolean;
  visible: boolean;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  booth_type?: string | null;
  tags?: string[];
};
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

const defaultColor: Record<Kind, string> = {
  stand: "#d1fae5",
  aisle: "#cbd5e1",
  door: "#fef3c7",
  access: "#dbeafe",
  emergency_exit: "#fee2e2",
  security: "#fee2e2",
  wall: "#64748b",
  column: "#94a3b8",
  plant: "#dcfce7",
  table: "#fef3c7",
  sofa: "#ede9fe",
  seating: "#f1f5f9",
  information: "#e0f2fe",
  camera_360: "#f3e8ff",
  cafe_station: "#fef3c7",
  restroom: "#dbeafe",
  fountain: "#bae6fd",
  forum: "#e2e8f0",
  press_area: "#fce7f3",
  external_area: "#ecfccb",
  flow_arrow: "#dbeafe",
  special: "#f3e8ff",
  polygon: "#f3e8ff",
  lobby: "#e0e7ff",
  blank: "#f8fafc",
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function kindOf(item: SceneElement): Kind {
  return (
    (item.metadata.object_type as Kind | undefined) ??
    (item.layer === "circulation" ? "access" : "special")
  );
}

function useImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const next = new window.Image();
    next.onload = () => setImage(next);
    next.src = url;
    return () => {
      next.onload = null;
    };
  }, [url]);
  return image;
}

function ElementSymbol({
  item,
  fill,
  company,
}: {
  item: SceneElement;
  fill: string;
  company?: string;
}) {
  const kind = kindOf(item);
  const { width, height } = item.geometry;
  if (kind === "stand") {
    const statusLabel: Record<string, string> = {
      available: "DISPONIBLE",
      reserved: "RESERVADO",
      assigned: "ASIGNADO",
      blocked: "BLOQUEADO",
    };
    const heading = (
      company ||
      statusLabel[item.status ?? "available"] ||
      "DISPONIBLE"
    ).toLocaleUpperCase("es-VE");
    const number = item.label.replace(/^stand\s*/i, "").trim() || item.label;
    const area = width * height;
    const headingSize = Math.max(0.2, Math.min(0.48, height * 0.13));
    const numberSize = Math.max(
      0.42,
      Math.min(0.95, Math.min(width * 0.28, height * 0.27)),
    );
    const badgeWidth = Math.min(width * 0.5, Math.max(1.15, width * 0.34));
    const badgeHeight = Math.min(height * 0.38, 1.05);
    const badgeX = width - badgeWidth - Math.max(0.08, width * 0.04);
    const badgeY = height - badgeHeight - Math.max(0.08, height * 0.04);
    const dimensions = `${width.toFixed(2)} ×\n${height.toFixed(2)} m\n${area.toFixed(area % 1 === 0 ? 0 : 2)} m²`;
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#334155"
          strokeWidth={0.06}
        />
        <Text
          text={heading}
          x={width * 0.06}
          y={height * 0.06}
          width={width * 0.88}
          height={height * 0.24}
          fontSize={headingSize}
          fontStyle="bold"
          align="center"
          ellipsis
          wrap="none"
          fill="#0f172a"
          listening={false}
        />
        <Text
          text={number}
          x={width * 0.08}
          y={height * 0.3}
          width={width * 0.84}
          height={height * 0.34}
          fontSize={numberSize}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          fill="#0f172a"
          listening={false}
        />
        <Rect
          x={badgeX}
          y={badgeY}
          width={badgeWidth}
          height={badgeHeight}
          fill="rgba(255,255,255,0.72)"
          stroke="#475569"
          strokeWidth={0.04}
          listening={false}
        />
        <Text
          text={dimensions}
          x={badgeX}
          y={badgeY + badgeHeight * 0.05}
          width={badgeWidth}
          height={badgeHeight * 0.9}
          fontSize={Math.max(0.16, Math.min(0.3, badgeHeight * 0.27))}
          lineHeight={0.92}
          align="center"
          verticalAlign="middle"
          fill="#0f172a"
          listening={false}
        />
      </Group>
    );
  }
  if (kind === "door")
    return (
      <Group>
        <Line
          points={[0, height, width * 0.72, height]}
          stroke="#475569"
          strokeWidth={0.08}
        />
        <Line
          points={[0, height, width * 0.72, height * 0.28]}
          stroke="#475569"
          strokeWidth={0.08}
        />
        <Arc
          x={0}
          y={height}
          innerRadius={width * 0.68}
          outerRadius={width * 0.72}
          angle={45}
          rotation={-45}
          stroke="#94a3b8"
          strokeWidth={0.06}
        />
        <Text
          text={String(item.metadata.door_role ?? "ENTRADA").toUpperCase()}
          x={0}
          y={height * 0.08}
          width={width}
          fontSize={Math.max(0.12, height * 0.45)}
          align="center"
          fill="#334155"
          listening={false}
        />
      </Group>
    );
  if (kind === "access")
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#2563eb"
          strokeWidth={0.08}
          cornerRadius={0.12}
        />
        <Arrow
          points={[width * 0.18, height * 0.5, width * 0.82, height * 0.5]}
          pointerLength={height * 0.28}
          pointerWidth={height * 0.28}
          stroke="#1d4ed8"
          fill="#1d4ed8"
          strokeWidth={0.1}
        />
        <Text
          text="ACCESO"
          x={0}
          y={height * 0.1}
          width={width}
          fontSize={Math.max(0.12, height * 0.25)}
          align="center"
          fill="#1e3a8a"
          listening={false}
        />
      </Group>
    );
  if (kind === "emergency_exit")
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#b91c1c"
          strokeWidth={0.08}
          cornerRadius={0.08}
        />
        <Arrow
          points={[width * 0.18, height * 0.5, width * 0.78, height * 0.5]}
          pointerLength={height * 0.24}
          pointerWidth={height * 0.24}
          stroke="#b91c1c"
          fill="#b91c1c"
          strokeWidth={0.08}
        />
        <Text
          text="SALIDA EMERGENCIA"
          x={0}
          y={height * 0.08}
          width={width}
          fontSize={Math.max(0.11, height * 0.18)}
          align="center"
          fill="#7f1d1d"
          listening={false}
        />
      </Group>
    );
  if (kind === "security")
    return (
      <Group>
        <Circle
          x={width / 2}
          y={height / 2}
          radius={Math.min(width, height) * 0.38}
          fill={fill}
          stroke="#4338ca"
          strokeWidth={0.1}
        />
        <Text
          text="✓"
          x={width * 0.25}
          y={height * 0.2}
          width={width * 0.5}
          height={height * 0.6}
          fontSize={Math.min(width, height) * 0.55}
          align="center"
          verticalAlign="middle"
          fill="#3730a3"
          listening={false}
        />
        <Text
          text="CTRL"
          x={0}
          y={height * 0.78}
          width={width}
          fontSize={Math.max(0.12, height * 0.16)}
          align="center"
          fill="#3730a3"
          listening={false}
        />
      </Group>
    );
  if (kind === "plant")
    return (
      <Group>
        <Circle
          x={width / 2}
          y={height / 2}
          radius={Math.min(width, height) * 0.26}
          fill="#86efac"
          stroke="#15803d"
          strokeWidth={0.07}
        />
        <Circle
          x={width * 0.32}
          y={height * 0.35}
          radius={Math.min(width, height) * 0.2}
          fill="#4ade80"
          stroke="#15803d"
          strokeWidth={0.05}
        />
        <Circle
          x={width * 0.68}
          y={height * 0.35}
          radius={Math.min(width, height) * 0.2}
          fill="#4ade80"
          stroke="#15803d"
          strokeWidth={0.05}
        />
        <Circle
          x={width * 0.5}
          y={height * 0.7}
          radius={Math.min(width, height) * 0.2}
          fill="#22c55e"
          stroke="#15803d"
          strokeWidth={0.05}
        />
      </Group>
    );
  if (kind === "table")
    return (
      <Group>
        <Ellipse
          x={width / 2}
          y={height / 2}
          radiusX={width * 0.28}
          radiusY={height * 0.28}
          fill={fill}
          stroke="#92400e"
          strokeWidth={0.1}
        />
        {[
          [0.18, 0.5],
          [0.82, 0.5],
          [0.5, 0.15],
          [0.5, 0.85],
        ].map(([x, y], index) => (
          <Circle
            key={index}
            x={width * x}
            y={height * y}
            radius={Math.min(width, height) * 0.09}
            fill="#f8fafc"
            stroke="#92400e"
            strokeWidth={0.06}
          />
        ))}
      </Group>
    );
  if (kind === "sofa")
    return (
      <Group>
        <Rect
          x={0.08}
          y={0.08}
          width={width - 0.16}
          height={height * 0.28}
          fill="#c4b5fd"
          stroke="#5b21b6"
          strokeWidth={0.08}
          cornerRadius={0.08}
        />
        <Rect
          x={0.08}
          y={height * 0.34}
          width={width - 0.16}
          height={height * 0.55}
          fill={fill}
          stroke="#5b21b6"
          strokeWidth={0.08}
          cornerRadius={0.12}
        />
        <Line
          points={[
            width * 0.28,
            height * 0.42,
            width * 0.28,
            height * 0.8,
            width * 0.72,
            height * 0.8,
            width * 0.72,
            height * 0.42,
          ]}
          stroke="#7c3aed"
          strokeWidth={0.05}
        />
      </Group>
    );
  if (kind === "wall")
    return (
      <Rect
        width={width}
        height={height}
        fill={fill}
        stroke="#334155"
        strokeWidth={Math.min(0.12, height * 0.25)}
      />
    );
  if (kind === "seating") {
    const chairs = Array.from({ length: 24 }, (_, index) => ({
      x: (((index % 6) + 0.5) * width) / 6,
      y: ((Math.floor(index / 6) + 0.5) * height) / 4,
    }));
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#64748b"
          strokeWidth={0.06}
        />
        {chairs.map((chair, index) => (
          <Rect
            key={index}
            x={chair.x - width * 0.045}
            y={chair.y - height * 0.07}
            width={width * 0.09}
            height={height * 0.14}
            fill="#fff"
            stroke="#475569"
            strokeWidth={0.025}
            cornerRadius={0.03}
          />
        ))}
      </Group>
    );
  }
  if (kind === "restroom")
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#2563eb"
          strokeWidth={0.08}
          cornerRadius={0.1}
        />
        <Text
          text="WC"
          width={width}
          height={height * 0.68}
          y={height * 0.12}
          fontSize={Math.max(0.3, Math.min(width, height) * 0.48)}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          fill="#1e3a8a"
          listening={false}
        />
        <Text
          text="BAÑOS"
          y={height * 0.78}
          width={width}
          fontSize={Math.max(0.13, height * 0.13)}
          align="center"
          fill="#1e40af"
          listening={false}
        />
      </Group>
    );
  if (kind === "camera_360")
    return (
      <Group>
        <Circle
          x={width / 2}
          y={height / 2}
          radius={Math.min(width, height) * 0.38}
          fill={fill}
          stroke="#7e22ce"
          strokeWidth={0.08}
        />
        <Circle
          x={width / 2}
          y={height / 2}
          radius={Math.min(width, height) * 0.18}
          fill="#fff"
          stroke="#7e22ce"
          strokeWidth={0.06}
        />
        <Text
          text="360°"
          width={width}
          y={height * 0.39}
          fontSize={Math.min(width, height) * 0.18}
          fontStyle="bold"
          align="center"
          fill="#581c87"
          listening={false}
        />
      </Group>
    );
  if (kind === "cafe_station")
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#92400e"
          strokeWidth={0.08}
          cornerRadius={0.1}
        />
        <Text
          text="CAFÉ"
          width={width}
          height={height}
          fontSize={Math.max(0.22, Math.min(width, height) * 0.3)}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          fill="#78350f"
          listening={false}
        />
      </Group>
    );
  if (kind === "fountain")
    return (
      <Group>
        <Ellipse
          x={width / 2}
          y={height / 2}
          radiusX={width * 0.46}
          radiusY={height * 0.38}
          fill={fill}
          stroke="#0284c7"
          strokeWidth={0.08}
        />
        <Ellipse
          x={width / 2}
          y={height / 2}
          radiusX={width * 0.34}
          radiusY={height * 0.23}
          fill="#e0f2fe"
          stroke="#38bdf8"
          strokeWidth={0.05}
        />
        <Text
          text="FUENTE"
          width={width}
          y={height * 0.39}
          fontSize={Math.max(0.14, height * 0.18)}
          align="center"
          fill="#075985"
          listening={false}
        />
      </Group>
    );
  if (kind === "forum")
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#334155"
          strokeWidth={0.08}
        />
        <Rect
          x={width * 0.08}
          y={height * 0.12}
          width={width * 0.84}
          height={height * 0.34}
          fill="#fff"
          stroke="#475569"
          strokeWidth={0.05}
        />
        <Text
          text="FORO / TARIMA"
          width={width}
          y={height * 0.2}
          fontSize={Math.max(0.18, height * 0.18)}
          fontStyle="bold"
          align="center"
          fill="#0f172a"
          listening={false}
        />
        <Line
          points={[width * 0.12, height * 0.7, width * 0.88, height * 0.7]}
          stroke="#64748b"
          strokeWidth={0.08}
          dash={[0.2, 0.12]}
        />
      </Group>
    );
  if (kind === "press_area")
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke="#be185d"
          strokeWidth={0.08}
          cornerRadius={0.1}
        />
        <Rect
          x={width * 0.12}
          y={height * 0.15}
          width={width * 0.76}
          height={height * 0.38}
          fill="#fff"
          stroke="#db2777"
          strokeWidth={0.05}
        />
        <Text
          text="SET PRENSA"
          width={width}
          y={height * 0.62}
          fontSize={Math.max(0.16, height * 0.17)}
          fontStyle="bold"
          align="center"
          fill="#831843"
          listening={false}
        />
      </Group>
    );
  if (kind === "external_area")
    return (
      <Group>
        <Rect
          width={width}
          height={height}
          fill={fill}
          opacity={0.55}
          stroke="#4d7c0f"
          strokeWidth={0.08}
          dash={[0.25, 0.14]}
        />
        <Text
          text="ÁREA EXTERNA"
          width={width}
          height={height}
          fontSize={Math.max(0.18, Math.min(width, height) * 0.16)}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          fill="#365314"
          listening={false}
        />
      </Group>
    );
  if (kind === "information")
    return (
      <Group>
        <Rect
          x={0.08}
          y={height * 0.2}
          width={width - 0.16}
          height={height * 0.6}
          fill={fill}
          stroke="#0369a1"
          strokeWidth={0.08}
          cornerRadius={0.08}
        />
        <Text
          text="i"
          x={0}
          y={height * 0.25}
          width={width}
          fontSize={height * 0.45}
          fontStyle="bold"
          align="center"
          fill="#075985"
          listening={false}
        />
      </Group>
    );
  if (kind === "flow_arrow")
    return (
      <Arrow
        points={[0.1, height / 2, width - 0.1, height / 2]}
        pointerLength={height * 0.8}
        pointerWidth={height * 0.9}
        stroke={fill}
        fill={fill}
        strokeWidth={Math.max(0.05, height * 0.18)}
      />
    );
  if (kind === "polygon" && item.geometry.points?.length) {
    const points = item.geometry.points.map((value, index) =>
      index % 2 === 0 ? value * width : value * height,
    );
    return (
      <Line
        points={points}
        closed
        fill={fill}
        opacity={0.8}
        stroke="#7c3aed"
        strokeWidth={0.08}
      />
    );
  }
  if (kind === "lobby")
    return (
      <Group>
        <Rect
          x={0.04}
          y={0.15}
          width={width - 0.08}
          height={height * 0.7}
          fill={fill}
          stroke="#4338ca"
          strokeWidth={0.08}
          cornerRadius={0.12}
        />
        <Line
          points={[width * 0.15, height * 0.85, width * 0.85, height * 0.85]}
          stroke="#4f46e5"
          strokeWidth={0.12}
        />
        <Text
          text="LOBBY"
          x={0}
          y={height * 0.35}
          width={width}
          fontSize={Math.max(0.15, height * 0.25)}
          align="center"
          fill="#312e81"
          listening={false}
        />
      </Group>
    );
  if (kind === "blank")
    return (
      <Rect
        width={width}
        height={height}
        fill={fill}
        opacity={0.35}
        dash={[0.2, 0.12]}
        stroke="#64748b"
        strokeWidth={0.06}
      />
    );
  return (
    <Group>
      <Rect
        width={width}
        height={height}
        fill={fill}
        stroke="#64748b"
        strokeWidth={0.05}
        cornerRadius={0.08}
      />
      <Text
        text={company ? `${item.label}\n${company}` : item.label}
        width={width}
        height={height}
        align="center"
        verticalAlign="middle"
        fontSize={Math.max(0.16, Math.min(0.42, width / 8))}
        fill="#1e293b"
        listening={false}
      />
    </Group>
  );
}

export function ExhibitionKonvaStage({
  columns,
  rows,
  elements,
  assignments,
  selectedIds,
  showGrid,
  showDimensions,
  snap,
  backgroundUrl,
  opacity,
  tool,
  polygonDraft,
  readOnly = false,
  calibrationActive = false,
  calibrationPoints = [],
  onSelect,
  onClear,
  onPlace,
  onPolygonPoint,
  onPolygonFinish,
  onMove,
  onTransform,
  onEditLabel,
  onCalibrationPoint,
}: {
  columns: number;
  rows: number;
  elements: SceneElement[];
  assignments: Map<string, string>;
  selectedIds: string[];
  showGrid: boolean;
  showDimensions: boolean;
  snap: boolean;
  backgroundUrl: string | null;
  opacity: number;
  tool: Kind | null;
  polygonDraft: number[];
  readOnly?: boolean;
  calibrationActive?: boolean;
  calibrationPoints?: { x: number; y: number }[];
  onSelect: (item: SceneElement, additive: boolean) => void;
  onClear: () => void;
  onPlace: (x: number, y: number) => void;
  onPolygonPoint: (x: number, y: number) => void;
  onPolygonFinish: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onTransform: (id: string, geometry: Geometry) => void;
  onEditLabel?: (item: SceneElement) => void;
  onCalibrationPoint?: (point: { x: number; y: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(760);
  const [zoom, setZoom] = useState(1);
  const image = useImage(backgroundUrl);
  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setHostWidth(Math.max(320, entry.contentRect.width)),
    );
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || readOnly) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) =>
        clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
      );
    };
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, [readOnly]);
  const fitScale = Math.min(
    hostWidth / Math.max(columns, 1),
    720 / Math.max(rows, 1),
  );
  const scale = fitScale * zoom;
  const width = columns * scale;
  const height = rows * scale;
  const sorted = useMemo(
    () =>
      [...elements]
        .filter((item) => item.visible)
        .sort((a, b) => a.z_index - b.z_index),
    [elements],
  );
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedNode =
    selectedIds.length === 1 ? nodeRefs.current.get(selectedIds[0]) : undefined;

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedNode, selectedIds]);

  function pointerPosition(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) {
    const point = event.target.getStage()?.getPointerPosition();
    return point ? { x: point.x / scale, y: point.y / scale } : null;
  }
  function snapValue(value: number) {
    return snap ? Math.round(value * 10) / 10 : value;
  }
  function moveItem(
    item: SceneElement,
    event: Konva.KonvaEventObject<DragEvent>,
  ) {
    const node = event.target;
    const nextX = Math.max(
      0,
      Math.min(columns - item.geometry.width, snapValue(node.x())),
    );
    const nextY = Math.max(
      0,
      Math.min(rows - item.geometry.height, snapValue(node.y())),
    );
    node.position({ x: nextX, y: nextY });
    onMove(item.id, nextX, nextY);
  }
  function transformItem(
    item: SceneElement,
    event: Konva.KonvaEventObject<Event>,
  ) {
    const node = event.target as Konva.Group;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scale({ x: 1, y: 1 });
    const nextWidth = Math.max(0.2, snapValue(item.geometry.width * scaleX));
    const nextHeight = Math.max(0.2, snapValue(item.geometry.height * scaleY));
    const geometry = {
      ...item.geometry,
      x: Math.max(0, Math.min(columns - nextWidth, snapValue(node.x()))),
      y: Math.max(0, Math.min(rows - nextHeight, snapValue(node.y()))),
      width: nextWidth,
      height: nextHeight,
      rotation: node.rotation(),
    };
    onTransform(item.id, geometry);
  }

  function changeZoom(nextZoom: number) {
    setZoom(clampZoom(nextZoom));
  }

  return (
    <div className="w-full rounded-xl bg-white">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs">
          <span className="font-semibold text-slate-700">Zoom del plano</span>
          <button
            type="button"
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            className="rounded border border-slate-300 p-1.5 text-slate-700 disabled:opacity-40"
            title="Alejar"
            aria-label="Alejar plano"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center font-semibold tabular-nums text-slate-700">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            className="rounded border border-slate-300 p-1.5 text-slate-700 disabled:opacity-40"
            title="Acercar"
            aria-label="Acercar plano"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            disabled={zoom === 1}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            title="Ajustar el plano al área visible"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Ajustar
          </button>
          <span className="ml-auto text-slate-500">
            Ctrl/Cmd + rueda para ampliar
          </span>
        </div>
      )}
      <div ref={hostRef} className="max-h-[75vh] w-full overflow-auto">
        <Stage
          width={width}
          height={height}
          style={{ cursor: calibrationActive ? "crosshair" : "default" }}
          onMouseDown={(event) => {
            if (event.target === event.target.getStage()) {
              const point = pointerPosition(event);
              if (calibrationActive && point)
                onCalibrationPoint?.({
                  x: Math.max(0, Math.min(columns, point.x)),
                  y: Math.max(0, Math.min(rows, point.y)),
                });
              else if (tool === "polygon" && point)
                onPolygonPoint(
                  Math.max(0, Math.min(columns, point.x)),
                  Math.max(0, Math.min(rows, point.y)),
                );
              else if (tool && point)
                onPlace(
                  Math.max(0, Math.min(columns - 1, point.x)),
                  Math.max(0, Math.min(rows - 1, point.y)),
                );
              else onClear();
            }
          }}
          onDblClick={(event) => {
            if (tool === "polygon" && event.target === event.target.getStage())
              onPolygonFinish();
          }}
          onTouchStart={(event) => {
            if (event.target !== event.target.getStage()) return;
            const point = pointerPosition(event);
            if (calibrationActive && point)
              onCalibrationPoint?.({
                x: Math.max(0, Math.min(columns, point.x)),
                y: Math.max(0, Math.min(rows, point.y)),
              });
            else onClear();
          }}
        >
          <Layer>
            <Group scaleX={scale} scaleY={scale}>
              {image && (
                <KonvaImage
                  image={image}
                  width={columns}
                  height={rows}
                  opacity={opacity / 100}
                  listening={false}
                />
              )}
              {calibrationPoints.length === 2 && (
                <Rect
                  x={Math.min(calibrationPoints[0].x, calibrationPoints[1].x)}
                  y={Math.min(calibrationPoints[0].y, calibrationPoints[1].y)}
                  width={Math.abs(
                    calibrationPoints[1].x - calibrationPoints[0].x,
                  )}
                  height={Math.abs(
                    calibrationPoints[1].y - calibrationPoints[0].y,
                  )}
                  fill="rgba(220,38,38,0.12)"
                  stroke="#dc2626"
                  strokeWidth={0.1}
                  dash={[0.25, 0.12]}
                  listening={false}
                />
              )}
              {calibrationPoints.map((point, index) => (
                <Group
                  key={`calibration-${index}`}
                  x={point.x}
                  y={point.y}
                  listening={false}
                >
                  <Circle
                    radius={0.18}
                    fill="#ffffff"
                    stroke="#dc2626"
                    strokeWidth={0.08}
                  />
                  <Line
                    points={[-0.35, 0, 0.35, 0]}
                    stroke="#dc2626"
                    strokeWidth={0.06}
                  />
                  <Line
                    points={[0, -0.35, 0, 0.35]}
                    stroke="#dc2626"
                    strokeWidth={0.06}
                  />
                </Group>
              ))}
              {showGrid &&
                Array.from({ length: columns + 1 }, (_, x) => (
                  <Line
                    key={`v-${x}`}
                    points={[x, 0, x, rows]}
                    stroke="#cbd5e1"
                    strokeWidth={0.015}
                    listening={false}
                  />
                ))}
              {showGrid &&
                Array.from({ length: rows + 1 }, (_, y) => (
                  <Line
                    key={`h-${y}`}
                    points={[0, y, columns, y]}
                    stroke="#cbd5e1"
                    strokeWidth={0.015}
                    listening={false}
                  />
                ))}
              {showGrid &&
                Array.from({ length: columns }, (_, x) => (
                  <Text
                    key={`x-${x}`}
                    text={String(x + 1)}
                    x={x + 0.05}
                    y={0.05}
                    fontSize={0.28}
                    fill="#64748b"
                    listening={false}
                  />
                ))}
              {showGrid &&
                Array.from({ length: rows }, (_, y) => (
                  <Text
                    key={`y-${y}`}
                    text={String(y + 1)}
                    x={0.05}
                    y={y + 0.32}
                    fontSize={0.28}
                    fill="#64748b"
                    listening={false}
                  />
                ))}
              {polygonDraft.length >= 2 && (
                <Line
                  points={polygonDraft}
                  stroke="#7c3aed"
                  strokeWidth={0.1}
                  dash={[0.25, 0.12]}
                  closed={polygonDraft.length >= 6}
                  listening={false}
                />
              )}
              {sorted.map((item) => {
                const kind = kindOf(item);
                const isSelected = selectedIds.includes(item.id);
                const company = assignments.get(item.id);
                const baseFill = String(item.style.fill ?? defaultColor[kind]);
                const fill =
                  kind === "stand"
                    ? standSizeColor(item.geometry.width, item.geometry.height)
                    : baseFill;
                return (
                  <Group
                    key={item.id}
                    ref={(node) => {
                      if (node) nodeRefs.current.set(item.id, node);
                      else nodeRefs.current.delete(item.id);
                    }}
                    x={item.geometry.x}
                    y={item.geometry.y}
                    rotation={item.geometry.rotation ?? 0}
                    draggable={!readOnly && !item.locked}
                    onMouseDown={(event) => {
                      event.cancelBubble = true;
                      onSelect(item, event.evt.ctrlKey || event.evt.metaKey);
                    }}
                    onDblClick={(event) => {
                      event.cancelBubble = true;
                      if (!readOnly) onEditLabel?.(item);
                    }}
                    onDblTap={(event) => {
                      event.cancelBubble = true;
                      if (!readOnly) onEditLabel?.(item);
                    }}
                    onTouchStart={(event) => {
                      event.cancelBubble = true;
                      onSelect(item, false);
                    }}
                    onDragEnd={(event) => {
                      if (!readOnly) moveItem(item, event);
                    }}
                    onTransformEnd={(event) => {
                      if (!readOnly) transformItem(item, event);
                    }}
                  >
                    <ElementSymbol item={item} fill={fill} company={company} />
                    {isSelected && (
                      <Rect
                        width={item.geometry.width}
                        height={item.geometry.height}
                        stroke="#047857"
                        strokeWidth={0.12}
                        cornerRadius={0.12}
                        listening={false}
                      />
                    )}
                    {isSelected && showDimensions && (
                      <Group listening={false}>
                        <Text
                          text={`${item.geometry.width.toFixed(1)} m`}
                          x={0}
                          y={item.geometry.height + 0.12}
                          width={item.geometry.width}
                          fontSize={0.24}
                          fill="#047857"
                          align="center"
                        />
                        <Text
                          text={`${item.geometry.height.toFixed(1)} m`}
                          x={item.geometry.width + 0.12}
                          y={item.geometry.height / 2}
                          fontSize={0.24}
                          fill="#047857"
                          rotation={90}
                        />
                      </Group>
                    )}
                  </Group>
                );
              })}
              {!readOnly && (
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  keepRatio={false}
                  enabledAnchors={[
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                  ]}
                  boundBoxFunc={(oldBox, newBox) =>
                    newBox.width < 0.2 || newBox.height < 0.2 ? oldBox : newBox
                  }
                />
              )}
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
