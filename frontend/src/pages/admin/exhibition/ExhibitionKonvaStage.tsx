import { useEffect, useMemo, useRef, useState } from "react";
import { Arc, Arrow, Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

type Geometry = { x: number; y: number; width: number; height: number; rotation?: number };
type SceneElement = { id: string; label: string; element_type?: string; status?: string; geometry: Geometry; layer: string; z_index: number; locked: boolean; visible: boolean; style: Record<string, unknown>; metadata: Record<string, unknown> };
type Kind = "stand" | "aisle" | "door" | "access" | "security" | "column" | "plant" | "table" | "sofa" | "information" | "flow_arrow" | "special";

const defaultColor: Record<Kind, string> = {
  stand: "#d1fae5", aisle: "#cbd5e1", door: "#fef3c7", access: "#dbeafe", security: "#fee2e2",
  column: "#94a3b8", plant: "#dcfce7", table: "#fef3c7", sofa: "#ede9fe", information: "#e0f2fe",
  flow_arrow: "#dbeafe", special: "#f3e8ff",
};

function kindOf(item: SceneElement): Kind {
  return (item.metadata.object_type as Kind | undefined) ?? (item.layer === "circulation" ? "access" : "special");
}

function useImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImage(null); return; }
    const next = new window.Image();
    next.onload = () => setImage(next);
    next.src = url;
    return () => { next.onload = null; };
  }, [url]);
  return image;
}

function ElementSymbol({ item, fill, company }: { item: SceneElement; fill: string; company?: string }) {
  const kind = kindOf(item);
  const { width, height } = item.geometry;
  if (kind === "door") return <Group><Line points={[0, height, width * 0.72, height]} stroke="#475569" strokeWidth={0.08} /><Line points={[0, height, width * 0.72, height * 0.28]} stroke="#475569" strokeWidth={0.08} /><Arc x={0} y={height} innerRadius={width * 0.68} outerRadius={width * 0.72} angle={45} rotation={-45} stroke="#94a3b8" strokeWidth={0.06} /><Text text={String(item.metadata.door_role ?? "ENTRADA").toUpperCase()} x={0} y={height * 0.08} width={width} fontSize={Math.max(0.12, height * 0.45)} align="center" fill="#334155" listening={false} /></Group>;
  if (kind === "access") return <Group><Rect width={width} height={height} fill={fill} stroke="#2563eb" strokeWidth={0.08} cornerRadius={0.12} /><Arrow points={[width * 0.18, height * 0.5, width * 0.82, height * 0.5]} pointerLength={height * 0.28} pointerWidth={height * 0.28} stroke="#1d4ed8" fill="#1d4ed8" strokeWidth={0.1} /><Text text="ACCESO" x={0} y={height * 0.1} width={width} fontSize={Math.max(0.12, height * 0.25)} align="center" fill="#1e3a8a" listening={false} /></Group>;
  if (kind === "security") return <Group><Circle x={width / 2} y={height / 2} radius={Math.min(width, height) * 0.38} fill={fill} stroke="#4338ca" strokeWidth={0.1} /><Text text="✓" x={width * 0.25} y={height * 0.2} width={width * 0.5} height={height * 0.6} fontSize={Math.min(width, height) * 0.55} align="center" verticalAlign="middle" fill="#3730a3" listening={false} /><Text text="CTRL" x={0} y={height * 0.78} width={width} fontSize={Math.max(0.12, height * 0.16)} align="center" fill="#3730a3" listening={false} /></Group>;
  if (kind === "plant") return <Group><Circle x={width / 2} y={height / 2} radius={Math.min(width, height) * 0.26} fill="#86efac" stroke="#15803d" strokeWidth={0.07} /><Circle x={width * 0.32} y={height * 0.35} radius={Math.min(width, height) * 0.2} fill="#4ade80" stroke="#15803d" strokeWidth={0.05} /><Circle x={width * 0.68} y={height * 0.35} radius={Math.min(width, height) * 0.2} fill="#4ade80" stroke="#15803d" strokeWidth={0.05} /><Circle x={width * 0.5} y={height * 0.7} radius={Math.min(width, height) * 0.2} fill="#22c55e" stroke="#15803d" strokeWidth={0.05} /></Group>;
  if (kind === "table") return <Group><Ellipse x={width / 2} y={height / 2} radiusX={width * 0.28} radiusY={height * 0.28} fill={fill} stroke="#92400e" strokeWidth={0.1} />{[[0.18, 0.5], [0.82, 0.5], [0.5, 0.15], [0.5, 0.85]].map(([x, y], index) => <Circle key={index} x={width * x} y={height * y} radius={Math.min(width, height) * 0.09} fill="#f8fafc" stroke="#92400e" strokeWidth={0.06} />)}</Group>;
  if (kind === "sofa") return <Group><Rect x={0.08} y={0.08} width={width - 0.16} height={height * 0.28} fill="#c4b5fd" stroke="#5b21b6" strokeWidth={0.08} cornerRadius={0.08} /><Rect x={0.08} y={height * 0.34} width={width - 0.16} height={height * 0.55} fill={fill} stroke="#5b21b6" strokeWidth={0.08} cornerRadius={0.12} /><Line points={[width * 0.28, height * 0.42, width * 0.28, height * 0.8, width * 0.72, height * 0.8, width * 0.72, height * 0.42]} stroke="#7c3aed" strokeWidth={0.05} /></Group>;
  if (kind === "information") return <Group><Rect x={0.08} y={height * 0.2} width={width - 0.16} height={height * 0.6} fill={fill} stroke="#0369a1" strokeWidth={0.08} cornerRadius={0.08} /><Text text="i" x={0} y={height * 0.25} width={width} fontSize={height * 0.45} fontStyle="bold" align="center" fill="#075985" listening={false} /></Group>;
  if (kind === "flow_arrow") return <Arrow points={[0.1, height / 2, width - 0.1, height / 2]} pointerLength={height * 0.8} pointerWidth={height * 0.9} stroke={fill} fill={fill} strokeWidth={Math.max(0.05, height * 0.18)} />;
  return <Group><Rect width={width} height={height} fill={fill} stroke="#64748b" strokeWidth={0.05} cornerRadius={0.08} /><Text text={company ? `${item.label}\n${company}` : item.label} width={width} height={height} align="center" verticalAlign="middle" fontSize={Math.max(0.16, Math.min(0.42, width / 8))} fill="#1e293b" listening={false} /></Group>;
}

export function ExhibitionKonvaStage({
  columns, rows, elements, assignments, selectedIds, showGrid, snap, backgroundUrl, opacity, tool,
  onSelect, onClear, onPlace, onMove, onTransform,
}: {
  columns: number; rows: number; elements: SceneElement[]; assignments: Map<string, string>; selectedIds: string[];
  showGrid: boolean; snap: boolean; backgroundUrl: string | null; opacity: number; tool: Kind | null;
  onSelect: (item: SceneElement, additive: boolean) => void; onClear: () => void; onPlace: (x: number, y: number) => void;
  onMove: (id: string, x: number, y: number) => void; onTransform: (id: string, geometry: Geometry) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(760);
  const image = useImage(backgroundUrl);
  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(([entry]) => setHostWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(hostWidth / Math.max(columns, 1), 720 / Math.max(rows, 1));
  const width = columns * scale;
  const height = rows * scale;
  const sorted = useMemo(() => [...elements].filter((item) => item.visible).sort((a, b) => a.z_index - b.z_index), [elements]);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedNode = selectedIds.length === 1 ? nodeRefs.current.get(selectedIds[0]) : undefined;

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedNode, selectedIds]);

  function pointerPosition(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const point = event.target.getStage()?.getPointerPosition();
    return point ? { x: point.x / scale, y: point.y / scale } : null;
  }
  function snapValue(value: number) { return snap ? Math.round(value * 10) / 10 : value; }
  function moveItem(item: SceneElement, event: Konva.KonvaEventObject<DragEvent>) {
    const node = event.target;
    const nextX = Math.max(0, Math.min(columns - item.geometry.width, snapValue(node.x())));
    const nextY = Math.max(0, Math.min(rows - item.geometry.height, snapValue(node.y())));
    node.position({ x: nextX, y: nextY });
    onMove(item.id, nextX, nextY);
  }
  function transformItem(item: SceneElement, event: Konva.KonvaEventObject<Event>) {
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

  return <div ref={hostRef} className="w-full overflow-auto rounded-xl bg-white">
    <Stage width={width} height={height} onMouseDown={(event) => {
      if (event.target === event.target.getStage()) {
        const point = pointerPosition(event);
        if (tool && point) onPlace(Math.max(0, Math.min(columns - 1, point.x)), Math.max(0, Math.min(rows - 1, point.y)));
        else onClear();
      }
    }} onTouchStart={(event) => { if (event.target === event.target.getStage()) onClear(); }}>
      <Layer>
        <Group scaleX={scale} scaleY={scale}>
        {image && <KonvaImage image={image} width={columns} height={rows} opacity={opacity / 100} listening={false} />}
        {showGrid && Array.from({ length: columns + 1 }, (_, x) => <Line key={`v-${x}`} points={[x, 0, x, rows]} stroke="#cbd5e1" strokeWidth={0.015} listening={false} />)}
        {showGrid && Array.from({ length: rows + 1 }, (_, y) => <Line key={`h-${y}`} points={[0, y, columns, y]} stroke="#cbd5e1" strokeWidth={0.015} listening={false} />)}
        {showGrid && Array.from({ length: columns }, (_, x) => <Text key={`x-${x}`} text={String(x + 1)} x={x + 0.05} y={0.05} fontSize={0.28} fill="#64748b" listening={false} />)}
        {showGrid && Array.from({ length: rows }, (_, y) => <Text key={`y-${y}`} text={String(y + 1)} x={0.05} y={y + 0.32} fontSize={0.28} fill="#64748b" listening={false} />)}
        {sorted.map((item) => {
          const kind = kindOf(item);
          const isSelected = selectedIds.includes(item.id);
          const fill = String(item.style.fill ?? defaultColor[kind]);
          const company = assignments.get(item.id);
          return <Group key={item.id} ref={(node) => { if (node) nodeRefs.current.set(item.id, node); else nodeRefs.current.delete(item.id); }} x={item.geometry.x} y={item.geometry.y} rotation={item.geometry.rotation ?? 0} draggable={!item.locked} onMouseDown={(event) => { event.cancelBubble = true; onSelect(item, event.evt.ctrlKey || event.evt.metaKey); }} onTouchStart={(event) => { event.cancelBubble = true; onSelect(item, false); }} onDragEnd={(event) => moveItem(item, event)} onTransformEnd={(event) => transformItem(item, event)}>
            <ElementSymbol item={item} fill={fill} company={company} />
            {isSelected && <Rect width={item.geometry.width} height={item.geometry.height} stroke="#047857" strokeWidth={0.12} cornerRadius={0.12} listening={false} />}
          </Group>;
        })}
        <Transformer ref={transformerRef} rotateEnabled keepRatio={false} enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} boundBoxFunc={(oldBox, newBox) => newBox.width < 0.2 || newBox.height < 0.2 ? oldBox : newBox} />
        </Group>
      </Layer>
    </Stage>
  </div>;
}
