export function ResourceUsage({row,notice=false}:{row:any;notice?:boolean}) {
 const origins=row.origins||[];
 return <div className="resource-usage">
  {notice&&<p>원본을 수정하면 연결된 사용처에도 반영됩니다. 따로 편집하려면 사본을 만드세요.</p>}
  {origins.length?<ul>{origins.map((origin:any,index:number)=><li key={index}>
   <strong>{origin.ownerName||'이름 없는 사용처'}</strong>
   <span>{[origin.tabName,origin.moduleName].filter(Boolean).join(' / ')}</span>
  </li>)}</ul>:<p>{row.canTrash===false?'접근할 수 없는 사용처가 있습니다. 권한이 있는 사용자에게 연결 해제를 요청하세요.':'아직 연결된 사용처가 없습니다.'}</p>}
  {(row.canTrash===false||origins.length>0)&&<p>사용 중인 원본은 삭제할 수 없습니다. 각 사용처의 연결을 먼저 해제하세요.</p>}
 </div>;
}
