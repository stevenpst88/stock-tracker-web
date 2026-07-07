import clsx from 'clsx';

interface Props {
  value: number;
  showSign?: boolean;
  colorize?: boolean;
  className?: string;
  decimals?: number;
}

export function formatTWD(value: number, decimals = 0): string {
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export default function CurrencyDisplay({
  value,
  showSign = false,
  colorize = false,
  className,
  decimals = 0,
}: Props) {
  const sign = showSign && value > 0 ? '+' : '';
  const colorClass = colorize
    ? value > 0
      ? 'text-emerald-400'
      : value < 0
        ? 'text-red-400'
        : 'text-slate-400'
    : '';

  return (
    <span className={clsx(colorClass, className)}>
      {sign}
      {formatTWD(value, decimals)}
    </span>
  );
}
