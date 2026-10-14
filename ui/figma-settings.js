import {savedFigmaFile,saveFigmaFile} from '../production/figma-connection.js';
export function renderFigmaSettings(host){
 host.innerHTML='<form class="figma-settings"><h2>Figma 연결</h2><p>피그마 디자인 주소를 이 브라우저에 저장합니다.</p><label>기본 디자인 주소<input name="url" type="url" placeholder="https://www.figma.com/design/…" aria-label="Figma 연결 주소"></label><div class="figma-settings-actions"><button class="keep-label" type="submit">연결 저장</button><button class="keep-label" type="button" data-disconnect>연결 해제</button><a class="button keep-label" href="https://www.figma.com/login" target="_blank" rel="noopener noreferrer">Figma에서 로그인</a></div><p class="muted">피그마 로그인은 피그마에서 관리합니다. 비공개 임베드의 로그인 유지 여부는 피그마 세션과 브라우저의 타사 쿠키 정책에 따라 달라집니다.</p><p role="status" data-status></p></form>';
 const form=host.querySelector('form'),input=form.elements.url,status=host.querySelector('[data-status]');input.value=savedFigmaFile();
 form.onsubmit=e=>{e.preventDefault();try{if(!input.value.trim())throw Error('연결할 Figma 주소를 입력하세요');input.value=saveFigmaFile(input.value);status.textContent='연결 주소를 저장했습니다.'}catch(error){status.textContent=error.message}};
 host.querySelector('[data-disconnect]').onclick=()=>{try{saveFigmaFile('');input.value='';status.textContent='기본 연결을 해제했습니다. 기존 모듈의 주소는 유지됩니다.'}catch(error){status.textContent=error.message}};
}
