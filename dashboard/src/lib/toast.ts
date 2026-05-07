import { toast } from "sonner"

export const showSuccess = (message: string) => toast.success(message)

export const showError = (
  message: string,
  options?: { action?: { label: string; onClick: () => void } }
) => toast.error(message, options ? { action: options.action } : undefined)

export const showWarning = (message: string) => toast.warning(message)

export const showInfo = (message: string) => toast.info(message)

export const showLoading = (message: string) => {
  const id = toast.loading(message)
  return () => toast.dismiss(id)
}
