import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

export type SwipeActionTone = 'approve' | 'archive' | 'restore' | 'neutral'

export interface SwipeAction {
  label: string
  onAction: () => void
  tone?: SwipeActionTone
  disabled?: boolean
}

const TONE_CLASSES: Record<SwipeActionTone, string> = {
  approve: 'bg-green-600 text-white active:bg-green-700',
  archive: 'bg-red-600 text-white active:bg-red-700',
  restore: 'bg-blue-600 text-white active:bg-blue-700',
  neutral: 'bg-gray-500 text-white active:bg-gray-600',
}

// Width of one revealed action button. 88px is roughly the iOS list-action
// width and comfortably fits "Archive"/"Mark paid" at this font size.
const ACTION_WIDTH = 88
// Fraction of a panel's width you have to drag past for the row to rest open
// on release instead of snapping shut.
const OPEN_RATIO = 0.4
// Fraction of the row's own width that turns a right-drag into a "full swipe":
// releasing past it fires the leading action outright, iOS-Mail style, rather
// than parking the row open.
const FULL_SWIPE_RATIO = 0.45
// Pointer travel before we decide the gesture is a horizontal swipe (and take
// it over) versus a vertical scroll (and leave it to the browser).
const AXIS_LOCK_PX = 8

// Only one row stays open at a time, list-wide and across lists -- opening a
// second row closes the first, same as iOS. Module-level rather than context
// so a row doesn't need a provider to behave correctly.
const openRowClosers = new Set<() => void>()

/**
 * iOS-style swipeable list row.
 *
 * - Drag LEFT to reveal `trailingActions` (archive/delete-shaped things). The
 *   row parks open so the action still has to be tapped -- destructive-ish
 *   actions shouldn't fire from the gesture alone.
 * - Drag RIGHT to reveal `leadingAction` (approve-shaped things). A short drag
 *   parks the row open; a full swipe fires the action directly.
 * - Tap the row itself for `onOpen` (the detail/edit sheet). While a row is
 *   parked open, a tap closes it instead -- it never falls through to `onOpen`.
 *
 * Actions are real buttons in the DOM at all times (just clipped), so keyboard
 * and screen-reader users reach them without performing a gesture.
 */
export function SwipeRow({
  children,
  onOpen,
  openLabel,
  leadingAction,
  trailingActions = [],
  className = '',
  contentClassName = 'bg-white dark:bg-gray-800',
}: {
  children: ReactNode
  onOpen?: () => void
  /** Accessible name for the tap target, e.g. "Open time entry for 2026-07-29". */
  openLabel?: string
  leadingAction?: SwipeAction | null
  trailingActions?: SwipeAction[]
  className?: string
  contentClassName?: string
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const startOffset = useRef(0)
  const axis = useRef<'none' | 'x' | 'y'>('none')
  // pointermove fires for a hovering mouse too, so the handler has to know a
  // gesture is actually in progress -- without this, merely moving the cursor
  // across a row drags it.
  const pressed = useRef(false)
  // The settle decision reads the offset the pointer left off at. Mirroring it
  // in a ref keeps that read exact even if the last move's re-render hasn't
  // landed by the time pointerup arrives.
  const offsetRef = useRef(0)
  // Suppresses the click that browsers synthesize at the end of a drag, so a
  // swipe never also opens the detail sheet.
  const swiped = useRef(false)

  const applyOffset = useCallback((next: number) => {
    offsetRef.current = next
    setOffset(next)
  }, [])

  const leading = leadingAction && !leadingAction.disabled ? leadingAction : null
  const trailing = trailingActions.filter((a) => !a.disabled)
  const leadingWidth = leading ? ACTION_WIDTH : 0
  const trailingWidth = trailing.length * ACTION_WIDTH

  const close = useCallback(() => applyOffset(0), [applyOffset])

  // Register as "the open row" only while actually open, so closing others is
  // a no-op walk over an empty set in the common case.
  useEffect(() => {
    if (offset === 0) return
    openRowClosers.add(close)
    return () => {
      openRowClosers.delete(close)
    }
  }, [offset, close])

  // A row that loses its actions (status changed under it) must not stay
  // parked open over an empty panel.
  useEffect(() => {
    if (offset > 0 && leadingWidth === 0) applyOffset(0)
    if (offset < 0 && trailingWidth === 0) applyOffset(0)
  }, [offset, leadingWidth, trailingWidth, applyOffset])

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pressed.current = true
    startX.current = e.clientX
    startY.current = e.clientY
    startOffset.current = offsetRef.current
    axis.current = 'none'
    swiped.current = false
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pressed.current || axis.current === 'y') return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current

    if (axis.current === 'none') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        axis.current = 'y'
        return
      }
      axis.current = 'x'
      swiped.current = true
      setDragging(true)
      for (const closeOther of openRowClosers) {
        if (closeOther !== close) closeOther()
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    const rowWidth = rowRef.current?.offsetWidth ?? 320
    // Right drags are allowed to run well past the parked-open position so a
    // full swipe is reachable; left drags stop at the panel width.
    const max = leading ? rowWidth * 0.8 : 0
    const min = -trailingWidth
    applyOffset(Math.max(min, Math.min(max, startOffset.current + dx)))
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pressed.current = false
    if (axis.current !== 'x') {
      axis.current = 'none'
      return
    }
    axis.current = 'none'
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    const rowWidth = rowRef.current?.offsetWidth ?? 320
    const settled = offsetRef.current
    if (leading && settled >= rowWidth * FULL_SWIPE_RATIO) {
      applyOffset(0)
      leading.onAction()
      return
    }
    if (leading && settled >= leadingWidth * OPEN_RATIO) {
      applyOffset(leadingWidth)
      return
    }
    if (trailing.length > 0 && settled <= -trailingWidth * OPEN_RATIO) {
      applyOffset(-trailingWidth)
      return
    }
    applyOffset(0)
  }

  function handleClick() {
    if (swiped.current) {
      swiped.current = false
      return
    }
    if (offsetRef.current !== 0) {
      applyOffset(0)
      return
    }
    onOpen?.()
  }

  function runAction(action: SwipeAction) {
    applyOffset(0)
    action.onAction()
  }

  return (
    <div ref={rowRef} className={`relative overflow-hidden ${className}`}>
      {leading && (
        <div className="absolute inset-y-0 left-0 flex" style={{ width: leadingWidth }}>
          <ActionButton action={leading} onRun={runAction} />
        </div>
      )}
      {trailing.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: trailingWidth }}>
          {trailing.map((action) => (
            <ActionButton key={action.label} action={action} onRun={runAction} />
          ))}
        </div>
      )}
      <div
        // touch-pan-y lets the browser keep vertical scrolling while we own the
        // horizontal axis -- without it the list wouldn't scroll over a row.
        // select-none + touch-callout:none stop iOS's text-selection loupe/
        // callout menu from hijacking a drag that starts on row text -- without
        // them, a slower drag (the full-width swipe "approve" needs) can get
        // swallowed by the native gesture before pointermove ever sees it.
        className={`relative touch-pan-y select-none [-webkit-touch-callout:none] ${contentClassName}`}
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={onOpen ? handleClick : undefined}
        onKeyDown={
          onOpen
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen()
                }
              }
            : undefined
        }
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        aria-label={onOpen ? openLabel : undefined}
      >
        {children}
      </div>
    </div>
  )
}

function ActionButton({ action, onRun }: { action: SwipeAction; onRun: (action: SwipeAction) => void }) {
  return (
    <button
      type="button"
      className={`flex flex-1 flex-col items-center justify-center px-1 text-xs font-semibold ${
        TONE_CLASSES[action.tone ?? 'neutral']
      }`}
      onClick={() => onRun(action)}
    >
      {action.label}
    </button>
  )
}
