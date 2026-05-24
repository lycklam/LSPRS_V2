import * as React from "react"
import { cn } from "@/lib/utils"

export type ToastProps = {
  variant?: "default" | "destructive"
}

export type ToastActionElement = React.ReactElement

export const ToastProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const ToastViewport = ({ className, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
  <ol className={cn("fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]", className)} {...props} />
)
export const Toast = ({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLLIElement> & ToastProps) => (
  <li className={cn("group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg",
    variant === "destructive" && "border-destructive bg-destructive text-destructive-foreground", className)} {...props} />
)
export const ToastTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-sm font-semibold", className)} {...props} />
)
export const ToastDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-sm opacity-90", className)} {...props} />
)
export const ToastClose = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={cn("absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100", className)} {...props}>✕</button>
)
export const ToastAction = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={cn("inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-sm font-medium", className)} {...props} />
)
