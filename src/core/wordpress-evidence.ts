export function decodeWordPressEvidence(value:unknown):string[]{
 if(Array.isArray(value))return value.filter((item):item is string=>typeof item==='string');
 if(typeof value!=='string'||value.trim()==='')return [];
 try{
  const parsed:unknown=JSON.parse(value);
  return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[];
 }catch{return [];}
}
