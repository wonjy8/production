import React, { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { plannerTokens } from './tokens';

type SquircleSize = keyof typeof plannerTokens.shape;

type SquircleProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  size?: SquircleSize;
  children?: ReactNode;
};

/**
 * Single source of truth for Production Planner's continuous-corner shape.
 *
 * Features should compose this primitive instead of introducing arbitrary
 * border-radius values. The `cornerShape` declaration is progressive
 * enhancement; borderRadius remains the shared fallback.
 */
export function Squircle({
  as: Component = 'div',
  size = 'surface',
  style,
  children,
  ...props
}: SquircleProps) {
  const radius = plannerTokens.shape[size];
  const squircleStyle: CSSProperties & { cornerShape?: string } = {
    borderRadius: radius,
    cornerShape: 'squircle',
    ...style,
  };

  return (
    <Component style={squircleStyle} {...props}>
      {children}
    </Component>
  );
}
