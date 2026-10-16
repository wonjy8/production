import {useEffect,useState} from 'react';
import {projectColors,projectColor} from './project-colors.js';
import {Icon} from './Icon';
export function ColorPresetPicker({value='',defaultColor='#444444',onChange}:any){
 const selected=projectColor(value||defaultColor),[hex,setHex]=useState(selected);
 useEffect(()=>setHex(selected),[selected]);
 return <fieldset className="color-preset-picker"><legend>일정 색</legend><div className="color-preset-row" role="group" aria-label="일정 색 프리셋">{projectColors.map(color=><button type="button" className="keep-label color-preset" key={color} aria-label={color+' 일정 색'} aria-pressed={selected.toLowerCase()===color} onClick={()=>onChange(color)}><span style={{backgroundColor:color}}>{selected.toLowerCase()===color&&<Icon name="check"/>}</span></button>)}</div><div className="color-preset-custom"><button type="button" className="button keep-label" onClick={()=>onChange('')}>프로젝트 색</button><label><span>직접 입력</span><input aria-label="일정 색" type="text" value={hex} pattern="#[0-9a-fA-F]{6}" maxLength={7} required placeholder="#444444" onChange={e=>{setHex(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))onChange(e.target.value)}}/></label></div></fieldset>
}
