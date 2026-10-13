import {useEffect,useState} from 'react';
const release='0.6.1';
export function WordcraftModule({module:m}:{module:any}){
 const [running,setRunning]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const url=new URL(`./modules/wordcraft/${release}/index.html`,window.location.href);
 useEffect(()=>{if(!running)return;const app:any=window;app.wordcraftOpenCount=(app.wordcraftOpenCount||0)+1;return ()=>{app.wordcraftOpenCount=Math.max(0,(app.wordcraftOpenCount||0)-1)}},[running]);
 async function start(){setError('');try{const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error();setRunning(true)}catch{setError('문서 편집기를 불러오지 못했습니다. 최신 배포가 완료되었는지 확인하고 다시 시도하세요.')}}
 return <div className="wordcraft-module"><div className="wordcraft-tools"><strong>Wordcraft 문서 편집기</strong><a className="button keep-label" href={url.href} target="_blank" rel="noopener noreferrer">새 창에서 열기</a><a className="wordcraft-source" href="https://github.com/storytold/wordcraft" target="_blank" rel="noopener noreferrer">오픈소스 · 라이선스</a></div><p className="muted">문서는 편집기의 파일 → 저장으로 기기에 다운로드합니다. 모듈을 닫거나 다른 화면으로 이동하기 전에 저장하세요.</p>{!running?<div className="wordcraft-start"><p>DOCX 문서를 열고 글·서식·표를 편집하세요.</p><button className="button primary keep-label" onClick={start}>문서 편집 시작</button></div>:<>{loading&&<p role="status">문서 편집기를 시작하는 중…</p>}<iframe className="wordcraft-frame" title={m.title||'Wordcraft 문서 편집기'} src={url.href} allow="fullscreen; clipboard-read; clipboard-write" allowFullScreen onLoad={()=>setLoading(false)}/></>}{error&&<p role="alert">{error}</p>}</div>
}
