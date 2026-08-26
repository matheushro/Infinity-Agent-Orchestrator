// Links clicked anywhere in the canvas belong to the user's browser, not to the
// app window. Main validates the scheme; this is just the fire-and-forget call.
export function openExternalUrl(url: string): void {
  const target = url.trim()
  if (!target) return
  void window.windowApi.openExternal(target)
}
