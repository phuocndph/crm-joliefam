import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // Safe theme access - fallback to "system" if ThemeProvider is not available
  let resolvedTheme: ToasterProps["theme"] = "system"
  
  try {
    const themeContext = useTheme()
    if (themeContext?.theme) {
      resolvedTheme = themeContext.theme as ToasterProps["theme"]
    }
  } catch {
    // ThemeProvider not available, use fallback
    console.warn("ThemeProvider not found, using system theme for Sonner")
  }

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
