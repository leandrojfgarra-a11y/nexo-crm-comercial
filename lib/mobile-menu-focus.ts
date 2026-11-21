export type MobileMenuFocusTarget = 'first' | 'last' | null

export function getMobileMenuFocusTarget(
  focusableElements: readonly HTMLElement[],
  activeElement: Element | null,
  shiftKey: boolean,
): MobileMenuFocusTarget {
  if (focusableElements.length === 0) return null

  const activeIndex = focusableElements.findIndex(element => element === activeElement)
  if (activeIndex === -1) return shiftKey ? 'last' : 'first'
  if (shiftKey && activeIndex === 0) return 'last'
  if (!shiftKey && activeIndex === focusableElements.length - 1) return 'first'
  return null
}

export function shouldRestoreMobileMenuFocus(input: {
  closeReason: 'dismiss' | 'navigation'
  currentPath: string
  openedPath: string | null
  triggerAvailable: boolean
}): boolean {
  return input.closeReason === 'dismiss'
    && input.currentPath === input.openedPath
    && input.triggerAvailable
}
