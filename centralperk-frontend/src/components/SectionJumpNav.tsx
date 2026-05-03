import { useEffect, useState } from "react";

export type SectionJumpItem = {
  id: string;
  label: string;
  helper?: string;
};

type SectionJumpNavProps = {
  items: SectionJumpItem[];
  title?: string;
  subtitle?: string;
  className?: string;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function SectionJumpNav({
  items,
  title,
  subtitle,
  className,
}: SectionJumpNavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (!items.length || typeof window === "undefined") return;

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visibleEntries[0]?.target?.id) {
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-25% 0px -55% 0px",
        threshold: [0.15, 0.35, 0.6],
      }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label={title || "Section navigation"}
      className={joinClasses(
        "sticky top-4 z-20 overflow-x-auto",
        className
      )}
    >
      <div className="inline-flex min-w-fit items-center gap-1 rounded-full bg-[#eef3fb] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        {title ? (
          <div className="mr-2 hidden shrink-0 lg:block">
            <p className="text-sm font-semibold text-[#10213d]">{title}</p>
            {subtitle ? <p className="text-xs text-[#5f6f86]">{subtitle}</p> : null}
          </div>
        ) : null}

        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={joinClasses(
                "group min-w-fit rounded-full px-4 py-2 text-sm font-medium leading-none transition",
                isActive
                  ? "bg-white text-[#10213d] ring-2 ring-[#2b4468] shadow-[0_2px_10px_rgba(26,43,71,0.16)]"
                  : "text-[#10213d] hover:bg-white/80"
              )}
            >
              <span>{item.label}</span>
              {item.helper ? <span className="ml-2 text-xs text-inherit/75">{item.helper}</span> : null}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
