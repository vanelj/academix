import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import type { LinkComponent } from '../../types';

export type ButtonVariant = 'primary' | 'ghost' | 'text';
export type ButtonSize = 'md' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2.5 whitespace-nowrap border font-ax-display font-semibold leading-none no-underline cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-200';

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-[52px] px-6 text-base rounded-xl',
  sm: 'min-h-[44px] px-4 text-[15px] rounded-[11px]',
};

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-ax-blue text-white shadow-ax-blue hover:bg-ax-blue-hover hover:-translate-y-px',
  ghost: 'border-ax-line bg-ax-surface text-ax-ink hover:border-ax-blue-text',
  text: 'border-transparent bg-transparent text-ax-blue-text px-0',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, sizes[size], variants[variant], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}

export interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  'aria-label'?: string;
  linkComponent?: LinkComponent;
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
  linkComponent: L = AnchorLink,
  ...rest
}: ButtonLinkProps) {
  return (
    <L href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </L>
  );
}
