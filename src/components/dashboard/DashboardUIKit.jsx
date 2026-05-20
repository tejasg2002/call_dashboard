'use client'

import { cn } from '../../lib/utils'

/** Rubick-style section block: title row + content. */
export function DashboardSection({ title, description, action, children, className }) {
  return (
    <section className={cn('space-y-4', className)}>
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">{description}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** White panel wrapper for charts, tables, filters. */
export function DashboardPanel({ children, className, padding = true }) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white dark:bg-slate-900/60',
        'border-slate-200/90 dark:border-slate-800',
        'shadow-card',
        padding && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

const KPI_ICON_BG = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  red: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

/** KPI tile: icon + value + label, optional top-right badge (Rubick General Report style). */
export function DashboardKpiCard({
  icon,
  label,
  value,
  sub,
  badge,
  badgeTone = 'neutral',
  accent = 'brand',
  detail,
  className,
}) {
  const badgeClass = {
    up: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    down: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  }

  return (
    <div
      className={cn(
        'relative rounded-2xl border p-4 sm:p-5 transition-all duration-200',
        'bg-white dark:bg-slate-900/60',
        'border-slate-200/90 dark:border-slate-800',
        'shadow-card hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                KPI_ICON_BG[accent] || KPI_ICON_BG.brand,
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-2xl sm:text-[1.65rem] font-bold text-slate-900 dark:text-white font-mono tracking-tight leading-none">
              {value}
            </p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1">{label}</p>
            {sub && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{sub}</p>
            )}
          </div>
        </div>
        {badge != null && badge !== '' && (
          <span
            className={cn(
              'shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold tabular-nums',
              badgeClass[badgeTone] || badgeClass.neutral,
            )}
          >
            {badge}
          </span>
        )}
      </div>
      {detail}
    </div>
  )
}

/** Toolbar strip for date filters / actions below page header. */
export function DashboardToolbar({ children, className }) {
  return (
    <DashboardPanel className={cn('flex flex-wrap items-center gap-2', className)} padding>
      {children}
    </DashboardPanel>
  )
}

/** In-page status meta (live dot, record count). */
export function DashboardStatusMeta({ items, className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400', className)}>
      {items.filter(Boolean).map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {item}
        </span>
      ))}
    </div>
  )
}
