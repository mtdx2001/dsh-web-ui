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

export function OverviewIcon({ size = 16 }: IconProps): JSX.Element {
  return <svg {...base(size)}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
}

export function DetailsIcon({ size = 16 }: IconProps): JSX.Element {
  return <svg {...base(size)}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
}

/** File glyph (files tab rows). */
export function FileIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M6 3h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M13 3v5h5" />
    </svg>
  )
}

/** Chevron glyphs for directory expand/collapse. */
export function ChevronIcon({ size = 12, open = false }: IconProps & { open?: boolean }): JSX.Element {
  return (
    <svg {...base(size)} style={{ transform: open ? 'rotate(90deg)' : undefined }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

/** Refresh glyph (files toolbar). */
export function RefreshIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  )
}

/** Collapse-all glyph (files toolbar). */
export function CollapseAllIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M5 20h14" />
    </svg>
  )
}

/** Back arrow glyph (files preview). */
export function BackIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

/** Official Sidebar panel glyph mirrored for a right-side panel. */
export function RightPanelIcon({ size = 16 }: IconProps): JSX.Element {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}><path fillRule="evenodd" clipRule="evenodd" d="M9.67272.522841c1.16118 0 2.08728-.000127 2.82358.079652.749.081164 1.3826.251755 1.9301.649477.324.23542.6091.5205.8445.84453.3977.54744.5683 1.18108.6495 1.93005C16.0002 4.7629 16 5.68895 16 6.85014v2.29972c0 1.16124.0002 2.08724-.0796 2.82364-.0812.7489-.2518 1.3826-.6495 1.93-.2354.3241-.5205.6091-.8445.8445-.5475.3978-1.1811.5683-1.9301.6495-.7363.0798-1.6624.0797-2.82358.0797H6.3273c-1.16119 0-2.08724.0001-2.82359-.0797-.74897-.0812-1.38261-.2517-1.93005-.6495-.32403-.2354-.609111-.5204-.844529-.8445-.397724-.5474-.568314-1.1811-.649478-1.93C-.000126 11.2371 0 10.3111 0 9.14986V6.85014C0 5.68895-.000126 4.7629.079653 4.02655c.081164-.74897.251754-1.38261.649478-1.93005.235418-.32403.520499-.60911.844529-.84453C2.1211.854248 2.75474.683657 3.50371.602493 4.24006.522714 5.16611.522841 6.3273.522841h3.34542ZM5.54303 1.88715V14.1118c.24333.001.50406.0051.78427.0051h3.34542c1.19118 0 2.03048-.0005 2.67658-.0704.6331-.0686 1.0004-.1971 1.2775-.3983.2086-.1516.3927-.3357.5443-.5443.2012-.2771.3296-.6444.3982-1.2775.07-.6461.0705-1.4854.0705-2.67654V6.85014c0-1.19118-.0005-2.03047-.0705-2.67654-.0686-.63312-.197-1.00042-.3982-1.27751-.1516-.20862-.3357-.39272-.5443-.5443-.2771-.20119-.6444-.32967-1.2775-.39826-.6461-.06995-1.4854-.07046-2.67658-.07046H6.3273c-.28021 0-.54094.00313-.78427.00408ZM4.1828 1.91166c-.19155.00994-.368.02411-.53204.04187-.63312.06859-1.00042.19707-1.27751.39826-.20862.15158-.39273.33568-.5443.5443-.20119.27709-.32967.64439-.39826 1.27751-.06995.64607-.07046 1.48536-.07046 2.67654v2.29972c0 1.19114.00051 2.03044.07046 2.67654.06859.6331.19707 1.0004.39826 1.2775.15157.2086.33568.3927.5443.5443.27709.2012.64439.3297 1.27751.3983.16402.0177.34051.0309.53204.0408V1.91166Z" fill="currentColor" /></svg>
}
