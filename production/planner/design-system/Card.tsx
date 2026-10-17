import React, { HTMLAttributes, ReactNode } from 'react';
import { Squircle } from './Squircle';
import { plannerTokens } from './tokens';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: 'compact' | 'default' | 'spacious';
};

const paddingMap = {
  compact: plannerTokens.space[3],
  default: plannerTokens.space[4],
  spacious: plannerTokens.space[6],
} as const;

/** Shared neutral surface. Domain components should compose Card rather than restyle it. */
export function Card({ children, padding = 'default', style, ...props }: CardProps) {
  return (
    <Squircle
      size="surface"
      style={{
        background: plannerTokens.color.surface,
        border: `1px solid ${plannerTokens.color.line}`,
        boxShadow: plannerTokens.shadow.surface,
        padding: paddingMap[padding],
        ...style,
      }}
      {...props}
    >
      {children}
    </Squircle>
  );
}
