import type {ReactNode} from 'react';
export type ModuleKind='text'|'schedule'|'timetable'|'schedule-list'|'tasks'|'image'|'video'|'file'|'link'|'embed'|'section-heading'|'divider'|'columns'|'grade-calculator'|'accounting'|'tracker';
export type Updater<T>=(current:T)=>T;
export interface ModuleFile {
 id:string;name?:string;kind?:string;mime?:string;size?:number;url?:string;display?:'normal'|'embed';
 photoEdit?:Record<string,unknown>;[field:string]:any;
}
export interface ModuleState {
 id:string;kind:ModuleKind|string;title?:string;files?:ModuleFile[];[field:string]:any;
}
export interface ModuleComponentProps<T extends ModuleState=ModuleState> {
 module:T;onChange:(update:Updater<T>)=>void;footerTools?:ReactNode;
}
export interface ModuleTemplate {
 id:string;category:string;name:string;description:string;icon:string;kind:ModuleKind;
 count?:number;headingLevel?:number;requiresUrl?:boolean;
}
export type ModuleTransfer=(from:string,to:string,fileId:string,before?:string)=>boolean;
