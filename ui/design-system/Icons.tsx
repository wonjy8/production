import React from 'react';
import type {SVGProps} from 'react';
import {icons} from './icon-pack.js';
export type PackIconProps = SVGProps<SVGSVGElement> & {size?: number | string; strokeWidth?: number};
function glyph(name: string) {
  return function PackIcon({size=18,strokeWidth=1.75,className='',...props}: PackIconProps) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={'ui-icon '+className} {...props} dangerouslySetInnerHTML={{__html:icons[name]}}/>;
  };
}
export const X=glyph('close');
export const Flag=glyph('flag');
export const Filter=glyph('filter');
export const Archive=glyph('archive');
export const ArrowDownToLine=glyph('download');
export const ArrowUpRight=glyph('arrowUpRight');
export const CalendarDays=glyph('calendar');
export const Check=glyph('check');
export const ChevronLeft=glyph('chevronLeft');
export const ChevronRight=glyph('chevronRight');
export const ChevronDown=glyph('down');
export const File=glyph('file');
export const Film=glyph('video');
export const Link=glyph('link');
export const ListChecks=glyph('tasks');
export const MessageSquare=glyph('feedback');
export const Plus=glyph('plus');
export const RotateCcw=glyph('refresh');
export const Trash2=glyph('trash');
export const Circle=glyph('circle');
export const Undo2=glyph('undo');
export const Redo2=glyph('redo');
export const MousePointer2=glyph('pointer');
export const Crop=glyph('crop');
export const Scan=glyph('scan');
export const Shapes=glyph('shapes');
export const RotateCw=glyph('rotateClockwise');
