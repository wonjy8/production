// Offline Korean public holidays. Lunar dates use ICU's lunisolar calendar at Seoul noon.
const cache=new Map();
const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shift=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return day(d)};
const weekday=s=>new Date(s+'T12:00:00').getDay();
export function koreanHolidays(year){
 if(cache.has(year))return cache.get(year);
 const map={},groups=[];const add=(dates,name,sub='')=>{for(const date of dates)map[date]=map[date]?map[date]+' · '+name:name;if(sub)groups.push({dates,name,sub})};
 for(const [md,name,sub] of [['01-01','신정',''],['03-01','삼일절','weekend'],['05-05','어린이날','weekend'],['06-06','현충일',''],['08-15','광복절','weekend'],['10-03','개천절','weekend'],['10-09','한글날','weekend'],['12-25','성탄절','weekend']])add([year+'-'+md],name,sub);
 const lunar=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'});
 for(let d=new Date(year,0,1,12);d.getFullYear()===year;d.setDate(d.getDate()+1)){
  const parts=Object.fromEntries(lunar.formatToParts(d).map(p=>[p.type,p.value])),date=day(d);
  if(parts.month==='1'&&parts.day==='1')add([shift(date,-1),date,shift(date,1)],'설날','sunday');
  if(parts.month==='4'&&parts.day==='8')add([date],'부처님오신날',year>=2023?'weekend':'');
  if(parts.month==='8'&&parts.day==='15')add([shift(date,-1),date,shift(date,1)],'추석','sunday');
 }
 // Announced one-off national holidays; future announcements can be added without a NAS update.
 for(const [date,name] of [['2024-04-10','국회의원 선거일'],['2024-10-01','국군의 날'],['2025-01-27','임시공휴일'],['2025-06-03','대통령 선거일'],['2026-06-03','지방선거일']])if(date.startsWith(year+'-'))add([date],name);
 for(const {dates,name,sub} of groups.sort((a,b)=>a.dates[0].localeCompare(b.dates[0]))){if(!dates.some(date=>weekday(date)===0||sub==='weekend'&&weekday(date)===6||map[date].includes(' · ')))continue;let next=shift(dates.at(-1),1);while([0,6].includes(weekday(next))||map[next])next=shift(next,1);add([next],name+' 대체공휴일')}
 cache.set(year,map);return map;
}
export const holidayName=date=>koreanHolidays(Number(date.slice(0,4)))[date]||'';
export const redCalendarDate=date=>[0,6].includes(weekday(date))||!!holidayName(date);
