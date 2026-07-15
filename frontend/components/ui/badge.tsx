import * as React from 'react'; import { cva, type VariantProps } from 'class-variance-authority'; import { cn } from '@/lib/utils';
const badgeVariants=cva('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',{variants:{variant:{neutral:'bg-muted text-muted-foreground',success:'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',warning:'bg-amber-500/10 text-amber-600 dark:text-amber-400'}},defaultVariants:{variant:'neutral'}});
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>,VariantProps<typeof badgeVariants>{}
function Badge({className,variant,...props}:BadgeProps){return <span className={cn(badgeVariants({variant}),className)} {...props}/>}; export {Badge,badgeVariants};
