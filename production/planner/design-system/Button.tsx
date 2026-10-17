import React, { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Squircle } from './Squircle';
import { plannerTokens } from './tokens';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const heights = {
  sm: plannerTokens.size.controlSm,
  md: plannerTokens.size.controlMd,
  lg: plannerTokens.size.controlLg,
} as const;

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: plannerTokens.color.primary,
    color: plannerTokens.color.primaryText,
    border: '1px solid transparent',
  },
  secondary: {
    background: plannerTokens.color.surfaceSubtle,
    color: plannerTokens.color.text,
    border: `1px solid ${plannerTokens.color.line}`,
  },
  ghost: {
    background: 'transparent',
    color: plannerTokens.color.text,
    border: '1px solid transparent',
  },
  danger: {
    background: plannerTokens.color.danger,
    color: '#FFFFFF',
    border: '1px solid transparent',
  },
};

/** Change button visuals here to update Production Planner buttons globally. */
export function Button({
  variant = 'primary',
  size = 'md',
  style,
  children,
  ...props
}: ButtonProps) {
  return (
    <Squircle
      as="button"
      size="control"
      style={{
        minHeight: heights[size],
        padding: size === 'sm' ? '0 12px' : size === 'lg' ? '0 20px' : '0 16px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: plannerTokens.space[2],
        font: 'inherit',
        fontWeight: 600,
        cursor: 'pointer',
        transition: `transform ${plannerTokens.motion.fast}ms ease, opacity ${plannerTokens.motion.fast}ms ease`,
        ...variants[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </Squircle>
  );
}
