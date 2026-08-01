/**
 * 原稿用紙の升目 — the manuscript square. Spec §7's signature element and the
 * only structural idea in the app: every prompt renders inside one, the combo
 * meter fills its centring cross from the middle outward, and the collection
 * grid is a full sheet of them.
 */

import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 0..1 — fills the centring cross outward from the middle */
  combo?: number
  /** Mincho for print, Gothic for screens (alternates per item) */
  face?: 'mincho' | 'gothic'
  /** flash the teacher's red pen on the border */
  error?: boolean
  /** ink the glyph in */
  inked?: boolean
  size?: 'lg' | 'md'
}

export function GenkoCell({
  children,
  combo = 0,
  face = 'gothic',
  error = false,
  inked = false,
  size = 'lg',
}: Props) {
  const scale = Math.max(0, Math.min(1, combo))
  return (
    <div
      className={[
        'relative aspect-square w-full select-none overflow-hidden',
        'border border-rule bg-paper-deep/40',
        size === 'lg' ? 'rounded-[2px]' : 'rounded-[1px]',
        error ? 'anim-correction' : '',
      ].join(' ')}
    >
      {/* the faint centring cross */}
      <div className="genko-cross absolute inset-0" aria-hidden />

      {/* combo fill: the same cross, inked outward from the centre */}
      {scale > 0 && (
        <div className="absolute inset-0" aria-hidden>
          <div
            className="absolute top-0 bottom-0 left-1/2 w-[3px] -translate-x-1/2 bg-mastery/70 transition-transform duration-200 ease-out"
            style={{ transform: `translateX(-50%) scaleY(${scale})` }}
          />
          <div
            className="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 bg-mastery/70 transition-transform duration-200 ease-out"
            style={{ transform: `translateY(-50%) scaleX(${scale})` }}
          />
        </div>
      )}

      <div
        className={[
          'absolute inset-0 flex items-center justify-center px-[6%] text-center leading-none',
          face === 'mincho' ? 'font-mincho' : 'font-gothic',
          inked ? 'anim-ink' : '',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  )
}
