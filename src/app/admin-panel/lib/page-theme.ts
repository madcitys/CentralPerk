export const adminPageShellClass = "max-w-7xl mx-auto space-y-6";

export const adminPageHeroClass =
  "overflow-hidden rounded-[28px] border border-[#cfe0f8] bg-[radial-gradient(circle_at_top_left,#dff7f7_0%,#ffffff_34%,#eef3ff_100%)] shadow-[0_18px_60px_rgba(26,43,71,0.1)]";

export const adminPageHeroInnerClass = "px-6 py-6 lg:px-8";

export const adminEyebrowClass =
  "inline-flex items-center gap-2 rounded-full border border-[#b9e4ea] bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]";

export const adminPageTitleClass = "mt-4 text-3xl font-bold tracking-tight text-[#10213d] lg:text-4xl";

export const adminPageDescriptionClass = "mt-2 text-sm leading-6 text-[#4b607f] lg:text-base";

export const adminPanelClass =
  "rounded-[24px] border border-[#d4ddf6] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[0_12px_34px_rgba(67,56,202,0.07)]";

export const adminPanelSoftClass =
  "rounded-[24px] border border-[#d6e0f7] bg-[linear-gradient(135deg,#ffffff_0%,#f3f9ff_100%)] p-6 shadow-[0_10px_30px_rgba(67,56,202,0.06)]";

export const adminMetricPanelClass =
  "rounded-[22px] border border-[#d4def6] bg-[linear-gradient(135deg,#ffffff_0%,#f4f8ff_100%)] p-5 shadow-[0_10px_28px_rgba(67,56,202,0.06)]";

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
