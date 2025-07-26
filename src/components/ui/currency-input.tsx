import * as React from "react"
import { cn } from "@/lib/utils"

interface CurrencyInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: number
  onChange?: (value: number) => void
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState("")

    React.useEffect(() => {
      if (value !== undefined && value !== null) {
        setDisplayValue(formatNumber(value))
      } else {
        setDisplayValue("")
      }
    }, [value])

    const formatNumber = (num: number) => {
      if (num === 0) return "0"
      return num.toLocaleString("vi-VN")
    }

    const parseNumber = (str: string) => {
      const cleaned = str.replace(/[^\d]/g, "")
      return cleaned === "" ? 0 : parseInt(cleaned, 10)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value
      const numericValue = parseNumber(inputValue)
      
      setDisplayValue(formatNumber(numericValue))
      onChange?.(numericValue)
    }

    return (
      <input
        {...props}
        type="text"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
      />
    )
  }
)

CurrencyInput.displayName = "CurrencyInput"

export { CurrencyInput }