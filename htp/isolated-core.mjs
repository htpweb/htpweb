// Isolated demo adapter, never a remote authorization boundary.
export function createIsolatedCore({clock=()=>new Date().toISOString()}={}) {
 const memberships=new Map(),commands=new Map();let masterAvailable=true;
 const memberKey=(user,org)=>JSON.stringify([user,org]);
 function permit(user,org,write=false){const role=memberships.get(memberKey(user,org));if(!role||write&&!['owner','operator'].includes(role))throw Error('DENIED');return role;}
 return Object.freeze({
 setMembership(user,org,role){if(!['owner','operator','reader',null].includes(role))throw Error('ROLE');if(role===null)memberships.delete(memberKey(user,org));else memberships.set(memberKey(user,org),role);},
 setMasterAvailable(value){if(typeof value!=='boolean')throw Error('STATE');masterAvailable=value;},
 ping({user,organization,module,version,key}){permit(user,organization,true);if(!['htp-demo-a','htp-demo-b'].includes(module)||version!=='1.0.0'||typeof key!=='string'||!/^[a-z0-9-]{1,64}$/i.test(key))throw Error('CONTRACT');const id=JSON.stringify([organization,user,module,key]);if(!commands.has(id))commands.set(id,Object.freeze({id,organization,actor:user,module,version,action:'ping',createdAt:clock()}));return {...commands.get(id)};},
 query(user,organization){permit(user,organization);return [...commands.values()].filter(c=>c.organization===organization).map(c=>({...c}));},
 console(user,organization){if(permit(user,organization)!=='owner')throw Error('DENIED');if(!masterAvailable)throw Error('MASTER_UNAVAILABLE');return {health:'unknown',source:'isolated-demo',events:this.query(user,organization)};}
 });
}
export function contractSummary(modules){return modules.map(m=>({id:m.id,version:m.version,owner:m.owner,dependencies:m.dependencies??[],contracts:m.contracts,state:m.state,health:'unknown'}));}