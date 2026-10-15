// HTP MASTER governance snapshot. Read-only, pure and independent of commercial operations.
import {createRegistry} from './registry.mjs';
export function createMasterSnapshot(modules){
 const registry=createRegistry(modules),list=registry.list();
 const rows=list.map(m=>Object.freeze({
  id:m.id,version:m.version,owner:m.owner,dataOwner:m.dataOwner,
  status:m.state,operational:m.operational===true,
  health:'unknown',source:'not-connected',
  required:m.dependencies.filter(d=>d.kind==='required').map(d=>d.moduleId),
  optional:m.dependencies.filter(d=>d.kind==='optional').map(d=>d.moduleId),
  consumers:registry.consumers(m.id).map(x=>x.id),
  apiContracts:m.contracts.map(c=>({id:c.id,version:c.version}))
 }));
 const byId=new Map(rows.map(r=>[r.id,r]));
 return Object.freeze({
  list:()=>structuredClone(rows),
  module:id=>{if(!byId.has(id))throw Error('UNKNOWN_MODULE');return structuredClone(byId.get(id));},
  impact:id=>registry.simulateDisable(id),
  summary:()=>Object.freeze({modules:rows.length,operational:rows.filter(x=>x.operational).length,health:'unknown',source:'not-connected',simulated:false})
 });
}
