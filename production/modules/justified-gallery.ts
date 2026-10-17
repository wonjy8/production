// Canonical TypeScript implementation; ../justified-gallery.js is a compatibility export.
export function justifiedRows(ratios,width,gap=10,targetHeight){const n=ratios.length;if(!n)return [];const target=targetHeight||Math.min(340,Math.max(160,width*.4)),cost=Array(n+1).fill(Infinity),prev=Array(n+1).fill(0);cost[0]=0;for(let end=1;end<=n;end++){let sum=0;for(let start=end-1;start>=Math.max(0,end-8);start--){sum+=Math.max(.15,Math.min(7,ratios[start]||1.333));const height=(width-gap*(end-start-1))/sum;if(height<=0)continue;const score=cost[start]+((height-target)/target)**2+Math.max(0,(height-target*1.75)/target)*4+.08;if(score<cost[end]){cost[end]=score;prev[end]=start}}}const groups=[];for(let end=n;end>0;){const start=prev[end],r=ratios.slice(start,end).map(v=>Math.max(.15,Math.min(7,v||1.333))),height=(width-gap*(r.length-1))/r.reduce((a,b)=>a+b,0);groups.unshift({start,end,height,widths:r.map(ratio=>ratio*height)});end=start}return groups}
export function maximumGalleryHeight(ratios,width,gap=10){return ratios.reduce((sum,r)=>sum+width/Math.max(.15,Math.min(7,r||4/3)),0)+Math.max(0,ratios.length-1)*gap}
export function fittedRows(ratios,width,height,gap=10){
 if(!ratios.length||width<=0)return [];const wanted=Math.max(1,height),candidates=[];
 for(let count=1;count<=ratios.length;count++){const rows=[];for(let i=0;i<count;i++){const start=Math.floor(i*ratios.length/count),end=Math.floor((i+1)*ratios.length/count),values=ratios.slice(start,end).map(r=>Math.max(.15,Math.min(7,r||4/3))),h=Math.max(1,(width-gap*(values.length-1))/values.reduce((s,r)=>s+r,0));rows.push({start,end,height:h,widths:values.map(r=>r*h)})}candidates.push(rows)}
 for(let target=40;target<=Math.max(width,wanted);target*=1.2)candidates.push(justifiedRows(ratios,width,gap,target));
 let best=[],score=-1;
 for(const rows of candidates){const total=rows.reduce((sum,r)=>sum+r.height,0),scale=Math.min(1,Math.max(0,(wanted-gap*(rows.length-1))/total));if(!scale)continue;const fitted=rows.map(r=>({...r,height:r.height*scale,widths:r.widths.map(w=>w*scale)})),area=fitted.reduce((sum,r)=>sum+r.height*r.widths.reduce((a,b)=>a+b,0),0);if(area>score){score=area;best=fitted}}
 return best;
}
