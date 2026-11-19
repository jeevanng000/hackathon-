export function AuroraBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#0B1020]"
    >
      {/* Subtle top-left primary indigo aura */}
      <div
        className="aurora-layer-a absolute -top-40 -left-32 w-[620px] h-[520px] rounded-full opacity-[0.16] blur-[110px]"
        style={{
          background:
            'radial-gradient(circle at center, #8B7CFF 0%, rgba(139, 124, 255, 0.2) 48%, transparent 75%)',
        }}
      />

      {/* Subtle right-side cyan aura */}
      <div
        className="aurora-layer-b absolute top-1/4 -right-36 w-[560px] h-[520px] rounded-full opacity-[0.12] blur-[120px]"
        style={{
          background:
            'radial-gradient(circle at center, #50D7E6 0%, rgba(80, 215, 230, 0.16) 45%, transparent 75%)',
        }}
      />

      {/* Soft lower vignette anchoring contrast */}
      <div
        className="absolute inset-x-0 bottom-0 h-64 opacity-70"
        style={{
          background: 'linear-gradient(to top, #070B16 0%, transparent 100%)',
        }}
      />
    </div>
  );
}
