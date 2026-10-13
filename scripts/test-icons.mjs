import assert from 'node:assert/strict';
import {decorateUI} from '../ui/decorate.js';
function button(text,compact=false){const classes=new Set(),props=new Map(),attrs=new Map();return {textContent:text,dataset:{},childNodes:[],svg:false,title:'',matches:s=>s.includes('.workspace-tabs')&&compact,querySelector(){return this.svg?{}:null},getAttribute:k=>attrs.get(k)||null,hasAttribute:k=>attrs.has(k),setAttribute:(k,v)=>attrs.set(k,v),classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,v){v?classes.add(k):classes.delete(k)}},style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)},classes,props};}
const b=button('제작 관리',true),root={querySelectorAll:()=>[b]};
decorateUI(root);assert(b.classes.has('has-pack-icon'));assert(b.classes.has('compact-nav'));assert(b.props.has('--button-icon'));
b.svg=true;decorateUI(root);assert(!b.classes.has('has-pack-icon'));assert(!b.props.has('--button-icon'));assert(!b.classes.has('ui-icon-button'));
b.svg=false;decorateUI(root);assert(b.classes.has('has-pack-icon'));assert(b.props.has('--button-icon'));
const action=button('숨기기');decorateUI({querySelectorAll:()=>[action]});const first=action.props.get('--button-icon');action.textContent='표시';decorateUI({querySelectorAll:()=>[action]});assert.notEqual(action.props.get('--button-icon'),first);assert.equal(action.getAttribute('aria-label'),'표시');assert.equal(action.title,'표시');
action.svg=true;decorateUI({querySelectorAll:()=>[action]});assert(!action.classes.has('has-pack-icon'));assert(action.classes.has('ui-icon-button'));
console.log('Icon regressions: fallback/SVG exclusivity, navigation classes, dynamic labels and tooltip passed');

// Simulate shell creation before the deferred icon bundle becomes available.
const {hydrateSidebarIcons,icons}=await import('../ui/icons.js');
const navigation=['home','reference','database','settings'].map(name=>({dataset:{navigationIcon:name},svg:null,inserts:0,querySelector(){return this.svg},insertAdjacentHTML(position,html){assert.equal(position,'afterbegin');assert.ok(html.includes(icons[name]));this.svg=html;this.inserts++}}));
const shell={querySelectorAll:selector=>{assert.equal(selector,'[data-navigation-icon]');return navigation}};
assert.ok(navigation.every(button=>!button.svg));hydrateSidebarIcons(shell);hydrateSidebarIcons(shell);
assert.ok(navigation.every(button=>button.svg&&button.inserts===1));
console.log('Deferred shell icons: all three common buttons and settings hydrate once after late bundle loading');
