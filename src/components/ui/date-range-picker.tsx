import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, startOfDay, endOfDay } from "date-fns"
import { vi } from "date-fns/locale"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithRangeProps {
  date: DateRange | undefined
  setDate: (date: DateRange | undefined) => void
  className?: string
}

export function DatePickerWithRange({
  className,
  date,
  setDate,
}: DatePickerWithRangeProps) {
  const handleToday = () => {
    const today = new Date();
    setDate({
      from: startOfDay(today),
      to: endOfDay(today)
    });
  };

  const handleFromBeginning = () => {
    setDate({
      from: new Date(2020, 0, 1), // Start from Jan 1, 2020
      to: endOfDay(new Date())
    });
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleToday}
          className="text-xs"
        >
          Hôm nay
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFromBeginning}
          className="text-xs"
        >
          Từ trước đến nay
        </Button>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y", { locale: vi })} -{" "}
                  {format(date.to, "LLL dd, y", { locale: vi })}
                </>
              ) : (
                format(date.from, "LLL dd, y", { locale: vi })
              )
            ) : (
              <span>Chọn khoảng thời gian</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 border-b border-border">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToday}
                className="justify-start"
              >
                Hôm nay
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFromBeginning}
                className="justify-start"
              >
                Từ trước đến nay
              </Button>
            </div>
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}