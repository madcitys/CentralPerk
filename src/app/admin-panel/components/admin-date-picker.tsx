import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "../../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { cn } from "../../../components/ui/utils";
import { adminInputClass } from "../lib/page-theme";

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

interface AdminDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AdminDatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  className,
}: AdminDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const { fromYear, toYear } = useMemo(() => buildYearBounds(), []);

  function commitDate(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    onChange(`${year}-${month}-${day}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={placeholder}
          className={cn(
            adminInputClass,
            "flex items-center justify-between gap-3 border-[#c8daf5] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)] px-4 text-left font-normal text-[#10213a] shadow-[0_8px_20px_rgba(26,43,71,0.08)] hover:border-[#aac9ef] hover:bg-[linear-gradient(180deg,#ffffff_0%,#eef5ff_100%)] hover:text-[#10213a]",
            !value && "text-[#6b7b93]",
            className
          )}
        >
          <span className="truncate">{formatButtonDate(value, placeholder)}</span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d9e5f6] bg-white text-[#35507a] shadow-sm">
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
        <Calendar
          mode="single"
          selected={selectedDate}
          captionLayout="dropdown"
          fromYear={fromYear}
          toYear={toYear}
          onSelect={(date) => {
            if (!date) return;
            commitDate(date);
          }}
          className="rounded-[18px] border border-[#e4ebf8] bg-white p-3"
          classNames={{
            months: "flex flex-col",
            month: "space-y-3",
            caption: "relative flex items-center justify-between gap-2 border-b border-[#edf2fb] pb-3",
            caption_label: "text-sm font-semibold tracking-[0.01em] text-[#10213a]",
            caption_dropdowns: "flex items-center gap-2",
            dropdown:
              "h-9 rounded-xl border border-[#d6e0f7] bg-[#f6f9ff] px-3 text-sm font-medium text-[#10213a] shadow-sm outline-none transition focus:border-[#18abc3] focus:ring-2 focus:ring-[#18abc3]/20",
            nav_button:
              "flex h-8 w-8 items-center justify-center rounded-xl border border-[#d6e0f7] bg-[#f7faff] text-[#48607d] shadow-sm hover:bg-[#eef5ff] hover:text-[#10213a]",
            nav_button_previous: "order-2",
            nav_button_next: "order-3",
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
