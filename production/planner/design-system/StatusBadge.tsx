import React from 'react';
import { Squircle } from './Squircle';
import { plannerTokens } from './tokens';

export type PlannerStatus = 'ready' | 'attention' | 'danger' | 'unknown';

const statusMap = {
  ready: { label: '준비 완료', color: plannerTokens.color.ready },
  attention: { label: '확인 필요', color: plannerTokens.color.attention },
  danger: { label: '문제 있음', color: plannerTokens.color.danger },
  unknown: { label: '미정', color: plannerTokens.color.textSecondary },
} as const;

export function StatusBadge({ status, label }: { status: PlannerStatus; label?: string }) {
  const item = statusMap[status];
  return (
    <Squircle
      as="span"
      size="control"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        background: `${item.color}12`,
        color: item.color,
        fontSize: 12,
        fontWeight: 650,
      }}
    >
      <span aria-hidden="true">●</span>
      {label ?? item.label}
    </Squircle>
  );
}
