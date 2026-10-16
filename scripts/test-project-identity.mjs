import assert from 'node:assert/strict';
import {emojiGroups,emojiCount,emojiMatches} from '../production/emoji-pack.js';
import {projectColors,projectColor,projectColorStyle} from '../production/project-colors.js';
const items=emojiGroups.flatMap(group=>group.emojis.map(item=>({item,group})));
assert.equal(items.length,emojiCount);assert(items.every(({item})=>item.nameKo));
for(const query of ['기도','십자가','대한민국','사진','강아지','달','웃음'])assert(items.some(({item,group})=>emojiMatches(item,group,query)),query);
assert(items.some(({item,group})=>emojiMatches(item,group,'camera')));assert(!emojiMatches(items[0].item,items[0].group,'존재하지않는검색어'));
assert.equal(projectColor('red;position:fixed'),projectColors[0]);assert.equal(projectColor('#3b82f6'),'#3b82f6');assert.equal(projectColorStyle('#3b82f6')['--project-soft'],'#3b82f624');
console.log('Project identity: Korean annotations for every emoji, multilingual search, safe colors and matching soft tints passed');

const {projectIconGroups}=await import('../production/project-icons.js'),{identityPaths}=await import('../ui/design-system/project-solid-icons.js'),{identityIconSVG,navigationIconSVG}=await import('../ui/design-system/icon-pack.js');
for(const [id] of projectIconGroups.flatMap(g=>g.items)){assert.ok(identityPaths[id],id);const svg=identityIconSVG(id);assert.match(svg,/fill="currentColor" stroke="none"/);assert.ok(svg.includes(identityPaths[id]));assert.doesNotMatch(svg,/script|onload|https:/);}
assert.equal(identityIconSVG('emoji:🌟').includes('🌟'),true);assert.match(navigationIconSVG('home'),/identity-icon/);assert.doesNotMatch(navigationIconSVG('home'),/nav-outline|nav-solid/);
console.log('Identity silhouettes: every picker glyph has a filled shape, emoji/image paths preserved, workspace project shape independent of selection');
