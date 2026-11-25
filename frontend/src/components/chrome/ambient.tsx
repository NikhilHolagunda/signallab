/** Drifting violet/pink aurora + animated film grain. Pure CSS, fixed, non-interactive. */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -left-[20%] -top-[30%] h-[80vh] w-[80vw] rounded-full opacity-40 blur-[120px]"
        style={{
          background: "radial-gradient(closest-side, rgb(139 92 246 / 0.55), transparent)",
          animation: "drift-a 26s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -bottom-[30%] -right-[20%] h-[80vh] w-[75vw] rounded-full opacity-35 blur-[120px]"
        style={{
          background: "radial-gradient(closest-side, rgb(236 72 153 / 0.45), transparent)",
          animation: "drift-b 32s ease-in-out infinite",
        }}
      />
      <div
        className="absolute left-1/3 top-1/3 h-[40vh] w-[40vw] rounded-full opacity-20 blur-[100px]"
        style={{
          background: "radial-gradient(closest-side, rgb(34 211 238 / 0.5), transparent)",
          animation: "drift-b 40s ease-in-out infinite reverse",
        }}
      />
      <Grain />
    </div>
  );
}

function Grain() {
  return (
    <svg
      className="absolute -inset-[10%] h-[120%] w-[120%] opacity-[0.07] mix-blend-overlay"
      style={{ animation: "grain 1.2s steps(6) infinite" }}
    >
      <filter id="sl-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#sl-grain)" />
    </svg>
  );
}
