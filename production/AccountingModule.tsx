import {Icon,IconButton} from './Icon';

type Row={id:string;label:string;amount:number;type:'income'|'expense'};
export function AccountingModule({module,onChange}:{module:any;onChange:(fn:any)=>void}){
 const rows:Row[]=module.rows||[];
 const update=(id:string,patch:Partial<Row>)=>onChange((old:any)=>({...old,rows:(old.rows||[]).map((row:Row)=>row.id===id?{...row,...patch}:row)}));
 const income=rows.filter(r=>r.type==='income').reduce((sum,r)=>sum+(Number(r.amount)||0),0);
 const expense=rows.filter(r=>r.type==='expense').reduce((sum,r)=>sum+(Number(r.amount)||0),0);
 return <div className="accounting-module"><div className="accounting-summary"><span>수입 <strong>{income.toLocaleString()}원</strong></span><span>지출 <strong>{expense.toLocaleString()}원</strong></span><span>잔액 <strong>{(income-expense).toLocaleString()}원</strong></span></div><div className="accounting-rows">{rows.map(row=><div className="accounting-row" key={row.id}><select aria-label="회계 구분" value={row.type} onChange={e=>update(row.id,{type:e.target.value as Row['type']})}><option value="income">수입</option><option value="expense">지출</option></select><input aria-label="회계 항목" placeholder="항목" value={row.label} onChange={e=>update(row.id,{label:e.target.value})}/><input aria-label="금액" type="number" min="0" step="1" value={row.amount} onChange={e=>update(row.id,{amount:Math.max(0,Number(e.target.value)||0)})}/><IconButton name="close" label="회계 항목 삭제" onClick={()=>onChange((old:any)=>({...old,rows:(old.rows||[]).filter((r:Row)=>r.id!==row.id)}))}/></div>)}</div><button className="button keep-label" onClick={()=>onChange((old:any)=>({...old,rows:[...(old.rows||[]),{id:crypto.randomUUID(),label:'',amount:0,type:'expense'}]}))}><Icon name="plus"/>항목 추가</button></div>;
}
