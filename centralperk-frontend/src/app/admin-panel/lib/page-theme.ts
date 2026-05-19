export const adminPageShellClass = "max-w-[1600px] w-full mx-auto px-5 py-5 space-y-4";

export const adminPageHeroClass =
  "overflow-hidden rounded-[28px] border border-[#eef3f9] bg-white shadow-[0_10px_28px_rgba(16,33,58,0.04)]";

export const adminPageHeroInnerClass = "p-6";

export const adminEyebrowClass =
  "inline-flex items-center gap-2 rounded-full border border-[#b9e4ea] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]";

export const adminPageTitleClass = "mt-4 text-[2.2rem] font-bold tracking-tight text-[#10213d] lg:text-[2.2rem]";

export const adminPageDescriptionClass = "mt-2 text-sm leading-6 text-[#4b607f] lg:text-base";

export const adminPanelClass =
  "rounded-[16px] border border-[#dde6f2] bg-white p-4 shadow-[0_8px_20px_rgba(16,33,58,0.04)]";

export const adminPanelSoftClass =
  "rounded-[16px] border border-[#e8eef7] bg-[#f8fbff] p-4 shadow-[0_8px_20px_rgba(16,33,58,0.04)]";

export const adminMetricPanelClass =
  "rounded-[16px] border border-[#d4def6] bg-[linear-gradient(135deg,#ffffff_0%,#f4f8ff_100%)] p-4 shadow-[0_8px_20px_rgba(16,33,58,0.06)]";

export function adminMetricVariantClass(index: number) {
  const variants = [
    "border-[#9fe6e5] bg-[linear-gradient(135deg,#ffffff_0%,#e6fbfa_100%)]",
    "border-[#bfd6ff] bg-[linear-gradient(135deg,#ffffff_0%,#e9f1ff_100%)]",
    "border-[#dfc7ff] bg-[linear-gradient(135deg,#ffffff_0%,#f4ebff_100%)]",
    "border-[#ffd2a1] bg-[linear-gradient(135deg,#ffffff_0%,#fff1dd_100%)]",
  ];
  return variants[index] || variants[0];
}

export const adminInputClass =
  "h-11 w-full rounded-xl border border-[#ccdaf0] bg-[#f7faff] px-4 py-2.5 text-sm text-[#10213a] shadow-sm outline-none transition focus:border-[#18abc3] focus:ring-2 focus:ring-[#18abc3]/20";

export const adminSelectClass =
  `${adminInputClass} appearance-none pr-11 bg-[image:linear-gradient(45deg,transparent_50%,#48607d_50%),linear-gradient(135deg,#48607d_50%,transparent_50%)] bg-[length:8px_8px,8px_8px] bg-[position:calc(100%-18px)_48%,calc(100%-12px)_48%] bg-no-repeat`;

export const adminPrimaryButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0b7f88] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(11,127,136,0.24)] transition hover:bg-[#096d75] hover:text-white focus-visible:ring-2 focus-visible:ring-[#0b7f88]/30 [&_svg]:h-4 [&_svg]:w-4";

export const adminDarkButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A2B47] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(26,43,71,0.18)] transition hover:bg-[#23385a] hover:text-white focus-visible:ring-2 focus-visible:ring-[#1A2B47]/25 [&_svg]:h-4 [&_svg]:w-4";

export const adminOutlineButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#c9d8eb] bg-white px-4 text-sm font-semibold text-[#1A2B47] transition hover:border-[#9eb8da] hover:bg-[#eef5ff] hover:text-[#10213a] focus-visible:ring-2 focus-visible:ring-[#1A2B47]/15 [&_svg]:h-4 [&_svg]:w-4";

export const adminDangerOutlineButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#f0c6c6] bg-white px-4 text-sm font-semibold text-[#9f2d2d] transition hover:border-[#e7a8a8] hover:bg-[#fff1f1] hover:text-[#842222] focus-visible:ring-2 focus-visible:ring-[#9f2d2d]/15 [&_svg]:h-4 [&_svg]:w-4";
