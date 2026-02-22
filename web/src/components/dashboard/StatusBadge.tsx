export interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'pending';
  label: string;
}

const STATUS_STYLES = {
  success: 'bg-success bg-opacity-10 text-success',
  warning: 'bg-warning bg-opacity-10 text-warning',
  error: 'bg-danger bg-opacity-10 text-danger',
  info: 'bg-primary bg-opacity-10 text-primary',
  pending: 'bg-slate-100 text-text-secondary',
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {label}
    </span>
  );
}
