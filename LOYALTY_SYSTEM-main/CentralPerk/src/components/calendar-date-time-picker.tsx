import { Clock3 } from "lucide-react";
import { CalendarDatePicker } from "./calendar-date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "./ui/utils";
import { adminInputClass } from "../app/admin-panel/lib/page-theme";

interface CalendarDateTimePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function splitDateTime(value: string) {
  if (!value) {
    return { date: "", hour: "08", minute: "00" };
  }

  const [datePart, timePart] = value.split("T");
  const [rawHour = "08", rawMinute = "00"] = (timePart || "08:00").split(":");

  return {
    date: datePart || "",
    hour: rawHour.padStart(2, "0"),
    minute: rawMinute.padStart(2, "0").slice(0, 2),
  };
}

function mergeDateTime(date: string, hour: string, minute: string) {
  if (!date) return "";
  return `${date}T${hour}:${minute}`;
}

function toTwelveHourLabel(hour24: string, minute: string) {
  const hourNumber = Number(hour24);
  const period = hourNumber >= 12 ? "pm" : "am";
  const twelveHour = hourNumber % 12 || 12;
  return `${String(twelveHour).padStart(2, "0")}:${minute} ${period}`;
}

function toHourOptionLabel(hour24: string) {
  const hourNumber = Number(hour24);
  const period = hourNumber >= 12 ? "pm" : "am";
  const twelveHour = hourNumber % 12 || 12;
  return `${String(twelveHour).padStart(2, "0")} ${period}`;
}

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export function CalendarDateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  className,
}: CalendarDateTimePickerProps) {
  const { date, hour, minute } = splitDateTime(value);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-[minmax(0,1fr)_184px]", className)}>
      <CalendarDatePicker
        id={id}
        value={date}
        onChange={(nextDate) => onChange(mergeDateTime(nextDate, hour, minute))}
        placeholder={placeholder}
      />

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              adminInputClass,
              "flex h-[54px] items-center justify-between gap-3 px-4 text-left"
            )}
          >
            <span className="flex items-center gap-3 text-[#48607d]">
              <Clock3 className="h-4 w-4" />
              <span className="font-medium text-[#10213a] tabular-nums">
                {toTwelveHourLabel(hour, minute)}
              </span>
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6a7a92]">
              time
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          avoidCollisions={false}
          className="w-[252px] rounded-[22px] border border-[#d6e0f7] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_18px_36px_rgba(16,33,58,0.13)]"
        >
          <div className="mb-3 px-1">
            <p className="text-[15px] font-semibold text-[#10213a]">Choose a time</p>
            <p className="mt-0.5 text-[11px] text-[#71839d]">
              Set the hour and minute for this campaign window.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-[18px] border border-[#e4ebf8] bg-white p-3 shadow-[0_8px_18px_rgba(16,33,58,0.04)]">
            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6a7a92]">
                Hour
              </p>
              <Select value={hour} onValueChange={(nextHour) => onChange(mergeDateTime(date, nextHour, minute))}>
                <SelectTrigger className="h-10 w-full rounded-xl border border-[#d6e0f7] bg-[#f6f9ff] pr-8 text-sm font-medium text-[#10213a] shadow-sm focus:border-[#18abc3] focus:ring-2 focus:ring-[#18abc3]/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 rounded-xl border border-[#d6e0f7] bg-white">
                  {hourOptions.map((option) => (
                    <SelectItem key={option} value={option}>{toHourOptionLabel(option)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6a7a92]">
                Minute
              </p>
              <Select value={minute} onValueChange={(nextMinute) => onChange(mergeDateTime(date, hour, nextMinute))}>
                <SelectTrigger className="h-10 w-full rounded-xl border border-[#d6e0f7] bg-[#f6f9ff] pr-8 text-sm font-medium text-[#10213a] shadow-sm focus:border-[#18abc3] focus:ring-2 focus:ring-[#18abc3]/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 rounded-xl border border-[#d6e0f7] bg-white">
                  {minuteOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between px-1">
            <p className="text-[11px] text-[#617491]">Selected: {toTwelveHourLabel(hour, minute)}</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
