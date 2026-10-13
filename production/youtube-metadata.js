import {youtubeURL} from './shared-modules.js';
export function youtubeId(url){return youtubeURL(url).match(/\/embed\/([\w-]{11})/)?.[1]||''}
export function youtubeThumbnail(url){const id=youtubeId(url);return id?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':''}
const cache=new Map(),queue=[];let running=0;
function drain(){while(running<4&&queue.length){const job=queue.shift();running++;job().finally(()=>{running--;drain()})}}
export function getYoutubeMetadata(url){const id=youtubeId(url);if(!id)return Promise.resolve(null);if(cache.has(id))return cache.get(id);const promise=new Promise(resolve=>{queue.push(async()=>{try{const response=await fetch('/api/youtube-meta?id='+id);if(!response.ok)throw Error();resolve(await response.json())}catch{resolve({id,title:'',thumbnail:youtubeThumbnail(url)});cache.delete(id)}});drain()});cache.set(id,promise);return promise}
