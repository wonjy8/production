// Imported modules keep their origin address, but their editable content is a snapshot.
export function importedModule(original,placement){
 const copy=JSON.parse(JSON.stringify(original));delete copy.source;delete copy.importSource;delete copy.sourceCopy;delete copy.sourceMetadata;
 const id=placement.id,localSchedules=copy.localSchedules?.map(s=>({...s,id:crypto.randomUUID(),moduleId:id}));
 return {...copy,...Object.fromEntries(['id','x','y','width','height','span'].filter(k=>placement[k]!==undefined).map(k=>[k,placement[k]])),importSource:placement.importSource||placement.source,sourceCopy:true,...(localSchedules?{localSchedules}:{})};
}
export function applyImportedContent(original,copy){
 const content=JSON.parse(JSON.stringify(copy));for(const key of ['id','source','importSource','sourceCopy','sourceMetadata','x','y','width','height','span'])delete content[key];
 if(content.localSchedules)content.localSchedules=content.localSchedules.map(s=>({...s,moduleId:original.id}));
 return {...original,...content,updatedAt:new Date().toISOString()};
}
