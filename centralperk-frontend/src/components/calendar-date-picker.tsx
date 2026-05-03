import { useEffect, useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "./ui/utils";
import { adminInputClass } from "../app/admin-panel/lib/page-theme";

function parseDateValue(value: string) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatButtonDate(value: string, placeholder: string) {
  const parsed = parseDateValue(value);
  if (!parsed) return placeholder;
  return parsed.toLocaleDateString("en-GB");
}

function buildYearBounds() {
  const currentYear = new Date().getFullYear();
  return {
    fromYear: currentYear - 5,
    toYear: currentYear + 5,
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface CalendarDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  fromYear?: number;
  toYear?: number;
  variant?: "default" | "soft";
}

export function CalendarDatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  className,
  triggerClassName,
  fromYear: fromYearOverride,
  toYear: toYearOverride,
  variant = "default",
}: CalendarDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const defaultYearBounds = useMemo(() => buildYearBounds(), []);
  const fromYear = fromYearOverride ?? defaultYearBounds.fromYear;
  const toYear = toYearOverride ?? defaultYearBounds.toYear;
  const [displayMonth, setDisplayMonth] = useState<Date>(() => selectedDate ?? new Date());
  const yearOptions = useMemo(
    () => Array.from({ length: toYear - fromYear + 1 }, (_, index) => fromYear + index),
    [fromYear, toYear]
  );

  useEffect(() => {
    if (!open) return;
    setDisplayMonth(selectedDate ?? new Date());
  }, [open, selectedDate]);

  function commitDate(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    onChange(`${year}-${month}-${day}`);
    setOpen(false);
  }

  function handleMonthChange(monthValue: string) {
    const nextMonth = Number(monthValue);
    if (Number.isNaN(nextMonth)) return;
    setDisplayMonth(new Date(displayMonth.getFullYear(), nextMonth, 1));
  }

  function handleYearChange(yearValue: string) {
    const nextYear = Number(yearValue);
    if (Number.isNaN(nextYear)) return;
    setDisplayMonth(new Date(nextYear, displayMonth.getMonth(), 1));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={placeholder}
          className={cn(
                variant === "default"
              ? cn(
                  adminInputClass,
                  "flex h-[54px] items-center justify-between gap-3 border-[#c8daf5] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)] px-4 text-left font-normal text-[#10213a] shadow-[0_8px_20px_rgba(26,43,71,0.08)] hover:border-[#aac9ef] hover:bg-[linear-gradient(180deg,#ffffff_0%,#eef5ff_100%)] hover:text-[#10213a]"
                )
              : "flex h-[54px] w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-[#dbe4f2] px-4 py-3 text-left font-normal text-[#10213a] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#1bb9d3] focus-visible:border-transparent hover:border-transparent hover:bg-[#dbe4f2]",
            !value && "text-[#6b7b93]",
            triggerClassName,
            className
          )}
        >
          <span className="truncate">{formatButtonDate(value, placeholder)}</span>
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#35507a]",
              variant === "default"
                ? "border border-[#d9e5f6] bg-white shadow-sm"
                : "border border-[#c7d2e3] bg-white/85"
            )}
          >
            <CalendarIcon className="h-4 w-4" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        avoidCollisions={false}
        className="w-[340px] rounded-[22px] border border-[#d6e0f7] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_18px_36px_rgba(16,33,58,0.13)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#10213a]">Choose a date</p>
            <p className="mt-0.5 text-[11px] text-[#71839d]">
              {selectedDate ? selectedDate.toLocaleDateString("en-GB") : "Pick a day from the calendar below."}
            </p>
          </div>
          {value ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="shrink-0 rounded-full border border-[#d8e2f4] px-3 py-1 text-[11px] font-semibold text-[#47607d] transition hover:border-[#b6ccec] hover:bg-[#eef5ff] hover:text-[#10213a]"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-[18px] border border-[#e4ebf8] bg-white p-3 shadow-[0_8px_18px_rgba(16,33,58,0.04)]">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6a7a92]">Month</p>
            <Select value={String(displayMonth.getMonth())} onValueChange={handleMonthChange}>
              <SelectTrigger className="h-9 rounded-xl border border-[#d6e0f7] bg-[#f6f9ff] text-sm font-medium text-[#10213a] shadow-sm focus:border-[#18abc3] focus:ring-2 focus:ring-[#18abc3]/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 rounded-xl border border-[#d6e0f7] bg-white">
                {MONTH_NAMES.map((monthName, index) => (
                  <SelectItem key={monthName} value={String(index)}>
                    {monthName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6a7a92]">Year</p>
            <Select value={String(displayMonth.getFullYear())} onValueChange={handleYearChange}>
              <SelectTrigger className="h-9 rounded-xl border border-[#d6e0f7] bg-[#f6f9ff] text-sm font-medium text-[#10213a] shadow-sm focus:border-[#18abc3] focus:ring-2 focus:ring-[#18abc3]/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 rounded-xl border border-[#d6e0f7] bg-white">
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          fromYear={fromYear}
          toYear={toYear}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          onSelect={(date) => {
            if (!date) return;
            commitDate(date);
          }}
          className="rounded-[18px] border border-[#e4ebf8] bg-white p-3"
          classNames={{
            months: "flex flex-col",
            month: "space-y-3",
            caption: "hidden",
            table: "w-full border-collapse",
            head_row: "grid grid-cols-7 gap-y-1",
            head_cell: "flex h-5 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6a7a92]",
            row: "mt-2 grid grid-cols-7 gap-y-1",
            cell: "flex h-9 w-full items-center justify-center p-0 text-center text-sm",
            day: "h-9 w-9 rounded-2xl text-sm font-medium text-[#10213a] transition hover:bg-[#eef5ff] hover:text-[#10213a]",
            day_today: "border border-[#7ad7db] bg-[#eefcfc] text-[#0f5f65]",
            day_selected:
              "!border-[#1A2B47] !bg-[#1A2B47] !text-white shadow-[0_10px_18px_rgba(26,43,71,0.22)] hover:!bg-[#23385a] hover:!text-white focus:!bg-[#1A2B47] focus:!text-white",
            day_outside: "text-[#a5b2c5]",
          }}
        />
        <div className="mt-2.5 flex items-center justify-between px-1">
          <p className="text-[11px] text-[#617491]">
            {selectedDate ? `Selected: ${selectedDate.toLocaleDateString("en-GB")}` : placeholder}
          </p>
          <button
            type="button"
            onClick={() => commitDate(new Date())}
            className="rounded-full bg-[#eef8f8] px-3 py-1 text-[11px] font-semibold text-[#0f766e] transition hover:bg-[#dff5f4] hover:text-[#0b5d57]"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
