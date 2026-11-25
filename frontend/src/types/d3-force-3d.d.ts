// Minimal typings for d3-force-3d (the package ships none).
declare module "d3-force-3d" {
  export interface SimulationNode {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface Force<N> {
    (alpha: number): void;
    initialize?(nodes: N[], ...args: unknown[]): void;
  }

  export interface Simulation<N extends SimulationNode> {
    tick(iterations?: number): this;
    stop(): this;
    restart(): this;
    nodes(): N[];
    nodes(nodes: N[]): this;
    alpha(): number;
    alpha(a: number): this;
    alphaMin(): number;
    alphaMin(a: number): this;
    alphaDecay(): number;
    alphaDecay(a: number): this;
    alphaTarget(a: number): this;
    velocityDecay(v: number): this;
    force(name: string): Force<N> | undefined;
    force(name: string, force: Force<N> | null): this;
  }

  export function forceSimulation<N extends SimulationNode>(
    nodes?: N[],
    numDimensions?: 1 | 2 | 3,
  ): Simulation<N>;

  export interface LinkForce<N, L> extends Force<N> {
    id(fn: (node: N) => string): this;
    distance(d: number | ((link: L) => number)): this;
    strength(s: number | ((link: L) => number)): this;
    links(links: L[]): this;
  }
  export function forceLink<N, L>(links?: L[]): LinkForce<N, L>;

  export interface ManyBodyForce<N> extends Force<N> {
    strength(s: number | ((node: N) => number)): this;
    distanceMax(d: number): this;
  }
  export function forceManyBody<N>(): ManyBodyForce<N>;

  export function forceCenter<N>(x?: number, y?: number, z?: number): Force<N>;

  export interface CollideForce<N> extends Force<N> {
    radius(r: number | ((node: N) => number)): this;
  }
  export function forceCollide<N>(radius?: number | ((node: N) => number)): CollideForce<N>;
}
