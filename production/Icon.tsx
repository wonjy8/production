import React from 'react';
import {icons} from '../ui/icons.js';
export function Icon({name}:{name:string}){if(name?.startsWith('emoji:'))return <span className="ui-icon ui-emoji" aria-hidden="true">{name.slice(6).slice(0,32)}</span>;return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html:icons[name]||icons.plus}}/>}
export function IconButton({name,label,...props}:{name:string;label:string;[key:string]:any}){return <button type="button" className="button ui-icon-button" data-control-icon={name} title={label} aria-label={label} {...props}><Icon name={name}/></button>}
