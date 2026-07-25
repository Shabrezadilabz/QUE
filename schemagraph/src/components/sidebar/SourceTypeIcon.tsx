import type { DataSourceType } from '@/types/dataSource'

interface SourceIconProps {
  type: DataSourceType
  className?: string
}

/**
 * Lightweight inline icons per connector type.
 * Swap for brand SVGs or an icon library later without changing row layout.
 */
export function SourceTypeIcon({ type, className = 'h-4 w-4' }: SourceIconProps) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    'aria-hidden': true as const,
  }

  switch (type) {
    case 'excel':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="0" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      )
    case 'mongodb':
      return (
        <svg {...common}>
          <path d="M12 3c2 3 4 6 4 10a4 4 0 0 1-8 0c0-4 2-7 4-10z" />
          <path d="M12 17v4" />
        </svg>
      )
    case 'databricks':
      return (
        <svg {...common}>
          <path d="M4 16l4-8 4 8 4-8 4 8" />
        </svg>
      )
    case 'snowflake':
      return (
        <svg {...common}>
          <path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11" />
        </svg>
      )
    case 'kafka':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 5v2M12 17v2M5 12h2M17 12h2M7 7l1.5 1.5M15.5 15.5L17 17M7 17l1.5-1.5M15.5 8.5L17 7" />
        </svg>
      )
    case 'csv':
      return (
        <svg {...common}>
          <path d="M6 4h9l5 5v11H6z" />
          <path d="M15 4v5h5M8 13h8M8 17h5" />
        </svg>
      )
    case 'mysql':
    case 'postgresql':
    case 'sql':
    default:
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      )
  }
}

/** Short label for type badge / filter matching */
export function sourceTypeLabel(type: DataSourceType): string {
  const labels: Record<DataSourceType, string> = {
    excel: 'Excel',
    sql: 'SQL',
    postgresql: 'PostgreSQL',
    mongodb: 'MongoDB',
    databricks: 'Databricks',
    snowflake: 'Snowflake',
    mysql: 'MySQL',
    csv: 'CSV',
    kafka: 'Kafka',
  }
  return labels[type]
}
