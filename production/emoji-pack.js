import groups from 'unicode-emoji-json/data-by-group.json' with {type:'json'};
const labels=['표정·감정','사람·몸','동물·자연','음식·음료','여행·장소','활동','사물','기호','깃발'];
export const emojiGroups=groups.map((group,index)=>({...group,label:labels[index]||group.name}));
export const emojiCount=emojiGroups.reduce((sum,group)=>sum+group.emojis.length,0);
