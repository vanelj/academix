import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import type { LinkComponent } from '../../types';

export type ButtonVariant = 'primary' | 'yellow' | 'outline' | 'soft';
export type ButtonSize = 'md' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full border-2 font-ax-body font-bold leading-none no-underline cursor-pointer transition-[transform,background-color,box-shadow,border-color] duration-200 hover:-translate-y-0.5';

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-[50px] px-[26px] text-base',
  sm: 'min-h-[44px] px-[18px] text-[15px]',
};

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-ax-violet text-white shadow-ax-violet hover:bg-ax-violet-hover',
  yellow: 'border-transparent bg-ax-yellow text-ax-indigo',
  outline: 'border-ax-ink bg-transparent text-ax-ink',
  soft: 'border-ax-line bg-ax-surface text-ax-ink hover:border-ax-violet-text',
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
