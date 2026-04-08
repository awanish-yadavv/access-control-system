'use client';

import moment from 'moment';

type DateTimeFormat = 'date' | 'datetime' | 'relative' | 'time';

interface DateTimeProps {
  /** ISO string, Date object, or any value moment can parse */
  value: string | Date | null | undefined;
  /** Display format (default: 'datetime') */
  format?: DateTimeFormat;
  /** Fallback when value is null/undefined */
  fallback?: string;
  className?: string;
}

const FORMAT_MAP: Record<DateTimeFormat, string> = {
  date:     'MMM D, YYYY',
  datetime: 'MMM D, YYYY HH:mm',
  time:     'HH:mm:ss',
  relative: '',   // uses fromNow()
};

const DateTime = ({ value, format = 'datetime', fallback = '—', className }: DateTimeProps) => {
  if (!value) return <span className={className ?? 'font-mono text-[10px] text-muted-foreground'}>{fallback}</span>;

  const m = moment(value);
  if (!m.isValid()) return <span className={className ?? 'font-mono text-[10px] text-muted-foreground'}>{fallback}</span>;

  const display = format === 'relative' ? m.fromNow() : m.format(FORMAT_MAP[format]);
  const title   = m.format('MMM D, YYYY HH:mm:ss');

  return (
    <span
      title={title}
      className={className ?? 'font-mono text-[10px] text-muted-foreground cursor-default'}
    >
      {display}
    </span>
  );
};

export default DateTime;
