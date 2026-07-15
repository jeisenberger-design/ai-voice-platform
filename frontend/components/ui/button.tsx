import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-50', { variants: { variant: { default: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border bg-background hover:bg-muted', ghost: 'hover:bg-muted' } }, defaultVariants: { variant: 'default' } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, ...props }, ref) => <button ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />);
Button.displayName = 'Button';
export { Button, buttonVariants };
