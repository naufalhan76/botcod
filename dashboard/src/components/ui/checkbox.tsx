'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

type CheckboxProps = Omit<React.ComponentProps<'input'>, 'type'>

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'size-4 shrink-0 rounded border border-input bg-transparent accent-sky-500 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
