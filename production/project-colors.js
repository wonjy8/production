export const projectColors=['#444444','#8b5cf6','#3b82f6','#06b6d4','#10b981','#84a83b','#eab308','#f59e0b','#f97316','#ec4899'];
export function projectColor(value){return /^#[0-9a-f]{6}$/i.test(value||'')?value:projectColors[0]}
export function projectColorStyle(value){const color=projectColor(value);return {'--project-color':color,'--project-soft':color+'24'};}
