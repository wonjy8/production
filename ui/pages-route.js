/* Shared URL routing: the root always selects local storage; NAS paths select an address or saved alias. */
globalThis.productionConnectionFromURL=(href,scope)=>{
 const url=new URL(href),base=new URL(scope);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('올바른 앱 주소가 아닙니다.');
 let address;
 try{address=decodeURIComponent(url.pathname.slice(base.pathname.length)).replace(/\/+$/,'')}catch{throw Error('NAS 주소의 URL 인코딩을 확인하세요.')}
 if(!address||address==='index.html')return 'local';
 if(/^@[a-z0-9][a-z0-9-]{0,39}$/.test(address))return 'alias:'+address.slice(1);
 if(['production-nas-install.zip','production-nas-update.zip','version.json','app.html','404.html','pages-sw.js','pages-loader.js','pages-route.js','pages-local.js','pages-updates.js'].includes(address))throw Error('이 경로는 앱 설치 파일용 주소입니다.');
 if(address.startsWith('http://'))throw Error('NAS는 HTTPS 주소를 사용해야 합니다.');
 const nas=new URL(address.startsWith('https://')?address:'https://'+address);
 if(nas.protocol!=='https:'||nas.username||nas.password||nas.pathname!=='/'||nas.search||nas.hash||!nas.hostname.includes('.')&&!nas.hostname.includes(':'))throw Error('NAS 도메인 주소만 입력하세요.');
 return nas.origin;
};
