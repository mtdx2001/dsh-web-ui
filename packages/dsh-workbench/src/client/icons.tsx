/**
 * Lucide-compatible stroke icons (24x24 viewBox, currentColor, 1.5 stroke) —
 * the same restrained inline-SVG pattern the sibling panel packages use.
 * @module dsh-workbench/client/icons
 */

import type { JSX } from 'react'

interface IconProps {
  size?: number
}

function base(size: number): Record<string, unknown> {
  return {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

/** Folder glyph (project section). */
export function FolderIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M4 5a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </svg>
  )
}

/** Message glyph (session section). */
export function MessageIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" />
    </svg>
  )
}

/** Target glyph (goal section). */
export function TargetIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" />
    </svg>
  )
}

/** List-checks glyph (todo section). */
export function ListChecksIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M3 6l1.5 1.5L7 5" />
      <path d="M3 13l1.5 1.5L7 12" />
      <path d="M11 6h10" />
      <path d="M11 13h10" />
      <path d="M3 20h18" />
    </svg>
  )
}

/** Clock glyph (background jobs section). */
export function ClockIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/** Branch glyph (subagents + git sections). */
export function BranchIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 8v8" />
      <path d="M18 10a6 6 0 0 1-6 6" />
    </svg>
  )
}

/** Wrench glyph (recent tools section). */
export function WrenchIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6l-2.6 2.6-2.5-.7-.7-2.5z" />
    </svg>
  )
}

export function AgentIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><circle cx="12" cy="8" r="3" /><path d="M6 20v-2a6 6 0 0 1 12 0v2" /><path d="M4 10V8a8 8 0 0 1 16 0v2" /></svg>
}

export function TasksIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8l1.5 1.5L12 7" /><path d="M14 9h3" /><path d="M8 15l1.5 1.5L12 14" /><path d="M14 16h3" /></svg>
}

export function SshIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3" /><path d="M13 15h4" /></svg>
}

export function KnowledgeIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 5.5v15" /><path d="M8 7h8M8 11h8" /></svg>
}

export function ExpertsIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M4 11h3M17 11h3" /></svg>
}

export function NewsIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
}

export function MonitoringIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>
}

export function SettingsIcon({ size = 18 }: IconProps): JSX.Element {
  return <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" /></svg>
}

export function CloseIcon({ size = 16 }: IconProps): JSX.Element {
  return <svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>
}
