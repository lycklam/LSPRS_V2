import * as React from "react"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 3000

type ToasterToast = {
  id: string
  title?: string
  description?: string
  variant?: "default" | "destructive"
  open?: boolean
}

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string }

interface State { toasts: ToasterToast[] }

let count = 0
const genId = () => { count = (count + 1) % Number.MAX_SAFE_INTEGER; return count.toString() }
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST": return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case "UPDATE_TOAST": return { ...state, toasts: state.toasts.map(t => t.id === action.toast.id ? { ...t, ...action.toast } : t) }
    case "DISMISS_TOAST": return { ...state, toasts: state.toasts.map(t => (!action.toastId || t.id === action.toastId) ? { ...t, open: false } : t) }
    case "REMOVE_TOAST": return !action.toastId ? { ...state, toasts: [] } : { ...state, toasts: state.toasts.filter(t => t.id !== action.toastId) }
  }
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach(l => l(memoryState))
}

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) return
  const timeout = setTimeout(() => { toastTimeouts.delete(toastId); dispatch({ type: "REMOVE_TOAST", toastId }) }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(toastId, timeout)
}

type Toast = Omit<ToasterToast, "id">

export function toast({ ...props }: Toast) {
  const id = genId()
  dispatch({ type: "ADD_TOAST", toast: { ...props, id, open: true } })
  return { id, dismiss: () => dispatch({ type: "DISMISS_TOAST", toastId: id }) }
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => { const i = listeners.indexOf(setState); if (i > -1) listeners.splice(i, 1) }
  }, [state])
  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => { if (toastId) addToRemoveQueue(toastId); dispatch({ type: "DISMISS_TOAST", toastId }) },
  }
}

export type { ToasterToast }
