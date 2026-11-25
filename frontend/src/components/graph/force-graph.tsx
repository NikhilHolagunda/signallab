"use client";

/**
 * 3D force-directed knowledge graph.
 *
 * Physics: d3-force-3d, ticked manually inside the r3f render loop.
 * Rendering: one InstancedMesh for all nodes + one LineSegments for all edges,
 * so a few thousand nodes stay at 60fps. Colours are pushed above 1.0 and
 * left un-tonemapped so the Bloom pass makes them glow.
 */

import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationNode,
} from "d3-force-3d";

import { clusterColor, KIND_META } from "@/lib/colors";
import type { GraphData, GraphNode } from "@/lib/types";

type SimNode = GraphNode & SimulationNode;
type SimLink = {
  source: SimNode | string;
  target: SimNode | string;
  weight: number;
  kind: "similar" | "has_topic";
};

const NODE_SCALE = 2.2;
const WHITE = new THREE.Color("#ffffff");
const EDGE_GREY = new THREE.Color("#3b4660");

// Survives graph refreshes so new data doesn't re-explode the layout.
const positionCache = new Map<string, { x: number; y: number; z: number }>();

function seedPosition() {
  const r = 120;
  return {
    x: (Math.random() - 0.5) * r,
    y: (Math.random() - 0.5) * r,
    z: (Math.random() - 0.5) * r,
  };
}

function useSimulation(data: GraphData) {
  return React.useMemo(() => {
    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      ...(positionCache.get(n.id) ?? seedPosition()),
    }));
    const links: SimLink[] = data.links.map((l) => ({ ...l }));
    const known = nodes.filter((n) => positionCache.has(n.id)).length / Math.max(1, nodes.length);

    const sim: Simulation<SimNode> = forceSimulation<SimNode>(nodes, 3)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.kind === "has_topic" ? 18 : 20 + (1 - l.weight) * 90))
          .strength((l) => (l.kind === "has_topic" ? 0.45 : l.weight * 0.7)),
      )
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength((n) => (n.kind === "topic" ? -90 : -40))
          .distanceMax(420),
      )
      .force("center", forceCenter<SimNode>())
      .stop();
    sim.alpha(known > 0.8 ? 0.25 : 1);

    const neighbors = new Map<string, Set<string>>();
    for (const l of data.links) {
      if (!neighbors.has(l.source)) neighbors.set(l.source, new Set());
      if (!neighbors.has(l.target)) neighbors.set(l.target, new Set());
      neighbors.get(l.source)!.add(l.target);
      neighbors.get(l.target)!.add(l.source);
    }
    return { nodes, links, sim, neighbors };
  }, [data]);
}

interface SceneProps {
  data: GraphData;
  selectedId: string | null;
  hoveredId: string | null;
  focusCluster: number | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function GraphObjects({
  data,
  selectedId,
  hoveredId,
  focusCluster,
  onHover,
  onSelect,
  overlay,
}: SceneProps & { overlay: React.RefObject<HTMLDivElement | null> }) {
  const { nodes, links, sim, neighbors } = useSimulation(data);
  const meshRef = React.useRef<THREE.InstancedMesh>(null);
  const tmp = React.useMemo(() => new THREE.Object3D(), []);
  const col = React.useMemo(() => new THREE.Color(), []);

  const baseColors = React.useMemo(
    () =>
      nodes.map((n) => {
        const c = new THREE.Color(clusterColor(n.cluster));
        return n.kind === "topic" ? c.lerp(WHITE, 0.4) : c;
      }),
    [nodes],
  );

  // Per-edge base colour: cluster colour when both ends share a cluster, else grey.
  const linkColors = React.useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return links.map((l) => {
      const s = typeof l.source === "string" ? byId.get(l.source) : l.source;
      const d = typeof l.target === "string" ? byId.get(l.target) : l.target;
      const same = !!s && !!d && s.cluster === d.cluster && s.cluster >= 0;
      return { color: same ? new THREE.Color(clusterColor(s!.cluster)) : EDGE_GREY, same };
    });
  }, [nodes, links]);

  const lineGeom = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(links.length * 6), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    const colr = new THREE.BufferAttribute(new Float32Array(links.length * 6), 3);
    colr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", pos);
    g.setAttribute("color", colr);
    return g;
  }, [links]);
  React.useEffect(() => () => lineGeom.dispose(), [lineGeom]);

  const focusId = hoveredId ?? selectedId;
  const isLit = React.useCallback(
    (n: SimNode) => {
      if (focusId) return n.id === focusId || !!neighbors.get(focusId)?.has(n.id);
      if (focusCluster !== null) return n.cluster === focusCluster;
      return true;
    },
    [focusId, focusCluster, neighbors],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const ticking = sim.alpha() > sim.alphaMin();
    if (ticking) sim.tick();
    const t = state.clock.elapsedTime;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const pulse = n.id === selectedId ? 1.55 + 0.12 * Math.sin(t * 4) : n.id === hoveredId ? 1.3 : 1;
      tmp.position.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);
      tmp.scale.setScalar(n.size * NODE_SCALE * pulse);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      col.copy(baseColors[i]).multiplyScalar(isLit(n) ? 1.7 : 0.1);
      mesh.setColorAt(i, col);
      if (ticking) positionCache.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (ticking) mesh.computeBoundingSphere(); // keeps raycasting accurate

    const pos = lineGeom.getAttribute("position") as THREE.BufferAttribute;
    const colors = lineGeom.getAttribute("color") as THREE.BufferAttribute;
    for (let i = 0; i < links.length; i++) {
      const s = links[i].source as SimNode;
      const d = links[i].target as SimNode;
      pos.setXYZ(i * 2, s.x ?? 0, s.y ?? 0, s.z ?? 0);
      pos.setXYZ(i * 2 + 1, d.x ?? 0, d.y ?? 0, d.z ?? 0);
      const incident = focusId !== null && (s.id === focusId || d.id === focusId);
      const { color: base, same: sameCluster } = linkColors[i];
      col.copy(base);
      let k = sameCluster ? 0.45 : 0.6;
      if (focusId) k = incident ? 1.4 : 0.05;
      else if (focusCluster !== null) k = s.cluster === focusCluster && sameCluster ? 0.9 : 0.05;
      col.multiplyScalar(k * (0.4 + links[i].weight));
      colors.setXYZ(i * 2, col.r, col.g, col.b);
      colors.setXYZ(i * 2 + 1, col.r, col.g, col.b);
    }
    pos.needsUpdate = true;
    colors.needsUpdate = true;
  });

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const id = nodes[e.instanceId]?.id ?? null;
    if (id !== hoveredId) onHover(id);
    document.body.style.cursor = "pointer";
  };
  const handleOut = () => {
    onHover(null);
    document.body.style.cursor = "";
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const n = nodes[e.instanceId];
    if (n) onSelect(n.id);
  };

  // Each drei <Html> is its own React root, so mounting/unmounting them on every
  // hover is expensive and noisy. Topic labels stay mounted (they just fade), and
  // a single focus label follows whichever node is hovered/selected.
  const topics = React.useMemo(() => nodes.filter((n) => n.kind === "topic"), [nodes]);
  const focusNode = nodes.find((n) => n.id === focusId) ?? null;

  return (
    <>
      <lineSegments geometry={lineGeom} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <instancedMesh
        key={nodes.length}
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[1, 18, 18]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Labels
        overlay={overlay}
        topics={topics}
        focusNode={focusNode}
        isLit={isLit}
      />
      <CameraRig target={nodes.find((n) => n.id === selectedId) ?? null} />
    </>
  );
}

/**
 * Labels are plain DOM nodes in an overlay <div>, positioned every frame by
 * projecting their 3D anchor to screen space. Cheaper than drei <Html> (one
 * React root per label) and plays nicely with React 19 StrictMode.
 */
function Labels({
  overlay,
  topics,
  focusNode,
  isLit,
}: {
  overlay: React.RefObject<HTMLDivElement | null>;
  topics: SimNode[];
  focusNode: SimNode | null;
  isLit: (n: SimNode) => boolean;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = React.useMemo(() => new THREE.Vector3(), []);
  const topicEls = React.useRef(new Map<string, HTMLDivElement>());
  const focusEl = React.useRef<HTMLDivElement | null>(null);

  // Create / destroy topic label elements when the topic set changes.
  React.useEffect(() => {
    const root = overlay.current;
    if (!root) return;
    const els = topicEls.current;
    for (const n of topics) {
      const el = document.createElement("div");
      el.className =
        "absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 transition-opacity duration-300 will-change-transform";
      el.textContent = `#${n.label}`;
      root.appendChild(el);
      els.set(n.id, el);
    }
    const focus = document.createElement("div");
    focus.className =
      "glass absolute left-0 top-0 whitespace-nowrap rounded-md px-2 py-1 font-mono text-[11px] text-white transition-opacity duration-150 will-change-transform";
    focus.style.opacity = "0";
    root.appendChild(focus);
    focusEl.current = focus;
    return () => {
      els.forEach((el) => el.remove());
      els.clear();
      focus.remove();
      focusEl.current = null;
    };
  }, [overlay, topics]);

  // Visibility + focus label content only change on React state changes.
  React.useEffect(() => {
    for (const n of topics) {
      const el = topicEls.current.get(n.id);
      if (el) el.style.opacity = isLit(n) && n.id !== focusNode?.id ? "1" : "0";
    }
    const f = focusEl.current;
    if (!f) return;
    if (!focusNode) {
      f.style.opacity = "0";
      return;
    }
    const label = focusNode.label.length > 48 ? focusNode.label.slice(0, 47) + "…" : focusNode.label;
    f.replaceChildren();
    const glyph = document.createElement("span");
    glyph.className = "mr-1.5";
    glyph.style.color = clusterColor(focusNode.cluster);
    glyph.textContent = KIND_META[focusNode.kind].glyph;
    f.append(glyph, document.createTextNode(label));
    f.style.opacity = "1";
  }, [topics, focusNode, isLit]);

  const place = (el: HTMLDivElement, n: SimNode) => {
    v.set(n.x ?? 0, (n.y ?? 0) + n.size * NODE_SCALE + 3, n.z ?? 0).project(camera);
    if (v.z > 1) {
      el.style.visibility = "hidden"; // behind the camera
      return;
    }
    el.style.visibility = "visible";
    const x = ((v.x + 1) / 2) * size.width;
    const y = ((1 - v.y) / 2) * size.height;
    el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
  };

  useFrame(() => {
    for (const n of topics) {
      const el = topicEls.current.get(n.id);
      if (el) place(el, n);
    }
    if (focusNode && focusEl.current) place(focusEl.current, focusNode);
  });
  return null;
}

type ControlsLike = { target: THREE.Vector3; update: () => void };

function CameraRig({ target }: { target: SimNode | null }) {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const camera = useThree((s) => s.camera);
  const flyUntil = React.useRef(0);
  const goal = React.useMemo(() => new THREE.Vector3(), []);
  const desired = React.useMemo(() => new THREE.Vector3(), []);
  const targetId = target?.id;

  React.useEffect(() => {
    if (targetId) flyUntil.current = performance.now() + 1400;
  }, [targetId]);

  useFrame(() => {
    if (!target || !controls || performance.now() > flyUntil.current) return;
    goal.set(target.x ?? 0, target.y ?? 0, target.z ?? 0);
    controls.target.lerp(goal, 0.08);
    desired.copy(camera.position).sub(controls.target).normalize().multiplyScalar(110).add(goal);
    camera.position.lerp(desired, 0.05);
    controls.update();
  });
  return null;
}

export default function ForceGraphCanvas(props: SceneProps) {
  const overlay = React.useRef<HTMLDivElement>(null);
  return (
    <div className="relative h-full w-full">
    <Canvas
      camera={{ position: [0, 0, 320], fov: 55, near: 1, far: 3000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 260, 900]} />
      <Stars radius={600} depth={120} count={2500} factor={3} saturation={0} fade speed={0.4} />
      <GraphObjects {...props} overlay={overlay} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={!props.selectedId && !props.hoveredId}
        autoRotateSpeed={0.35}
        minDistance={20}
        maxDistance={1200}
      />
      <EffectComposer>
        <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={1.15} />
      </EffectComposer>
    </Canvas>
    <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
