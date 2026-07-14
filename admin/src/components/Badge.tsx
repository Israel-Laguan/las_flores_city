import { cn } from '@/lib/cn';
import styles from './Badge.module.css';

interface BadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'info' | 'muted';
  children: React.ReactNode;
}

export default function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={cn(styles.badge, styles[variant])}>
      {children}
    </span>
  );
}
