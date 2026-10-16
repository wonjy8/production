import React, {forwardRef} from 'react';
import type {ButtonHTMLAttributes, HTMLAttributes, ReactNode} from 'react';
import {Icon} from './Icon';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default'|'primary'|'quiet'|'danger'; size?: 'default'|'compact'; icon?: string;
};
export const Button=forwardRef<HTMLButtonElement,ButtonProps>(function Button({variant='default',size='default',icon,className='',children,type='button',...props},ref){
 return <button ref={ref} type={type} className={'ui-button '+className} data-variant={variant} data-size={size} data-icon-only={icon&&!children?'true':undefined} {...props}>{icon&&<Icon name={icon}/ >}{children}</button>;
});
export function PageHeading({title,actions}:{title:string;actions?:ReactNode}){
 return <header className="ui-page-heading workspace-page-heading"><h1>{title}</h1>{actions&&<div className="ui-heading-actions">{actions}</div>}</header>;
}
export function Surface({className='',...props}:HTMLAttributes<HTMLDivElement>){return <div className={'ui-card '+className} {...props}/>}
