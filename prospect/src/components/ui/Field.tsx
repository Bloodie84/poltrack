import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink-0 ' +
  'placeholder:text-ink-2 focus:border-accent focus:outline-none disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-1">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-ink-2">{hint}</span> : null}
      {error ? <span className="mt-1.5 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, className)} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(CONTROL, className)}>
      {children}
    </select>
  );
}

export function Toggle({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent-strong)]"
      />
      <span>
        <span className="block text-sm font-medium text-ink-0">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-2">{hint}</span> : null}
      </span>
    </label>
  );
}
