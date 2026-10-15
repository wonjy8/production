import {planningSnapshot,planningUniverse} from './planning-model.js';
import {Icon} from './Icon';
import {useEffect,useRef,useState} from 'react';
import {sourceInfo} from './project-lifecycle.js';
import {resolveSharedModule} from './shared-modules.js';
import {ModuleBrowser} from './ModuleBrowser';
import {Modal} from './Modal';
import {duplicateFiles} from './ArchiveLibrary';
import {importedModule} from './imported-modules.js';
export function SharedSource({placement,workspace,references,onReplace,onSaveOriginal}:any){
 const info=sourceInfo(placement.importSource||placement.source,workspace,references),[armed,setArmed]=useState(false),[reconnect,setReconnect]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),root=useRef<HTMLElement>(null);
 useEffect(()=>{setSaved(false);setArmed(false)},[JSON.stringify(placement)]);
 useEffect(()=>{if(!armed)return;const outside=(e:Event)=>{if(!e.composedPath().includes(root.current!))setArmed(false)},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setArmed(false)};document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',key)}},[armed]);
 return <footer className="shared-source shared-source-footer" ref={root}>{!info.available&&<><small>원본이 없거나 접근 권한이 없습니다.</small><button className="button keep-label" onClick={()=>{setReconnect(true);setError('')}}>새 원본 연결</button></>}{armed?<span className="inline-save-confirm"><button className="keep-label" disabled={busy} onClick={()=>setArmed(false)}>취소</button><button className="keep-label source-save-button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onSaveOriginal();setArmed(false);setSaved(true)}catch(e:any){setError(e.message||'원본 저장 실패')}finally{setBusy(false)}}}>{busy?'저장 중':'원본에 저장할까요?'}</button></span>:<button className="keep-label source-save-button" disabled={!info.available||!placement.sourceCopy||busy} onClick={()=>{setSaved(false);setArmed(true)}}><Icon name="save"/>원본에 저장</button>}{saved&&<small role="status">원본에 저장했습니다.</small>}{error&&<small role="alert">{error}</small>}{reconnect&&<Modal title="새 원본 연결" onClose={()=>{if(!busy)setReconnect(false)}}><ModuleBrowser workspace={workspace} references={references} onPick={async(item:any)=>{setBusy(true);setError('');try{const original=resolveSharedModule({source:item.source},workspace,references);if(!original)throw Error('사용할 수 없는 원본입니다.');const [copy]=await duplicateFiles([planningSnapshot(original,planningUniverse(workspace,references))]);onReplace(importedModule(copy,{...placement,importSource:item.source}));setReconnect(false)}catch(e:any){setError(e.message)}finally{setBusy(false)}}}/>{error&&<p role="alert">{error}</p>}</Modal>}</footer>
}
