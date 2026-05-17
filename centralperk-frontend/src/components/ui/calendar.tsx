"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "./utils";
import { buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 text-[#10213a]", className)}
      classNames={{
        months: "flex flex-col gap-2 sm:flex-row",
        month: "flex flex-col gap-4",
        caption: "relative flex w-full items-center justify-center pt-1",
        caption_label: "text-sm font-semibold text-[#10213a]",
        caption_dropdowns: "flex items-center gap-2",
        dropdown:
          "h-9 rounded-xl border border-[#d6e0f7] bg-[#f6f9ff] px-3 text-sm font-medium text-[#10213a] shadow-sm outline-none transition focus:border-[#18abc3] focus:ring-2 focus:ring-[#18abc3]/20",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "size-8 rounded-xl border-[#d6e0f7] bg-[#f7faff] p-0 text-[#48607d] opacity-100 shadow-sm hover:bg-[#eef5ff] hover:text-[#10213a]",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-x-1",
        head_row: "flex",
        head_cell:
          "w-10 rounded-md text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[#6a7a92]",
        row: "mt-2 flex w-full",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md",
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "size-10 rounded-2xl p-0 font-medium text-[#10213a] aria-selected:opacity-100",
        ),
        day_range_start:
          "day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_range_end:
          "day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_selected:
          "bg-[#1A2B47] text-white shadow-[0_10px_18px_rgba(26,43,71,0.22)] hover:bg-[#1A2B47] hover:text-white focus:bg-[#1A2B47] focus:text-white",
        day_today: "border border-[#9fe6e5] bg-[#eefcfc] text-[#0f766e]",
        day_outside:
          "day-outside text-[#a5b2c5] aria-selected:text-[#a5b2c5]",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("size-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("size-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  );
}

export { Calendar };

