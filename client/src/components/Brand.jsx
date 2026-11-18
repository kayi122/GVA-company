export function BrandMark({ className = 'h-11 w-11' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M7 20a12.5 12.5 0 0 1 18 0" stroke="#b8d433" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M10.5 23.5a7.5 7.5 0 0 1 11 0" stroke="#b8d433" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="27" r="2" fill="#b8d433" />
      <path d="M16 3v9M11.5 7.5h9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className={compact ? 'h-9 w-9' : 'h-12 w-12'} />
      <div className="leading-none">
        <div className={compact ? 'text-xl font-extrabold tracking-[0.18em] text-white' : 'text-3xl font-extrabold tracking-[0.18em] text-white'}>GVA</div>
        <div className="mt-1.5 text-[10px] font-medium tracking-[0.3em] text-slate-300">SALES PIPELINE</div>
      </div>
    </div>
  );
}
