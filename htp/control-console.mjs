// HTP Control: pure, isolated incident and dependency governance.
// No network, no browser trust boundary, no claims of persistent audit.
// MASTER may be stopped without affecting business or command execution.
import {createRegistry} from './registry.mjs';
const CODES=new Set(['UNKNOWN','DEGRADED','UNAVAILABLE','RECOVERED']);
const clock=()=>new Date().toISOString();
const copy=structuredClone;
export function createControlConsole(modules,{now=clock}={}){
 const registry=createRegistry(modules),observations=[],incidents=[];
 let enabled=true,sequence=0;
 const known=new Set(registry.list().map(m=>m.id));
 function validate(id){if(!known.has(id))throw Error('UNKNOWN_MODULE');return id;}
 function operator(actor){if(typeof actor!=='string'||!/^[-a-z0-9_]{2,64}$/i.test(actor))throw Error('OPERATOR');return actor;}
 function online(){if(!enabled)throw Error('MASTER_UNAVAILABLE');}
 function safeNote(note){if(typeof note!=='string'||!note.trim()||note.length>500||/[\u0000-\u001f]/.test(note))throw Error('NOTE');return note.trim();}
 function stamp(){const value=now();if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('CLOCK');return value;}
 function record(kind,moduleId,actor,payload){const event=Object.freeze({sequence:++sequence,kind,moduleId,actor,at:stamp(),...payload});return event;}
 return Object.freeze({
  pause(){enabled=false;},
  resume(){enabled=true;},
  registry(){online();return registry.list();},
  module(id){online();validate(id);return registry.list().find(m=>m.id===id);},
  consumers(id){online();return registry.consumers(validate(id));},
  impact(id){online();return registry.simulateDisable(validate(id));},
  observe({moduleId,health,source,actor}){
   online();validate(moduleId);operator(actor);
   if(!CODES.has(health))throw Error('HEALTH');
   const event=record('observation',moduleId,actor,{health,source:safeNote(source),verified:false,persisted:false});
   observations.push(event);return copy(event);
  },
  openIncident({moduleId,code,reason,actor}){
   online();validate(moduleId);operator(actor);
   if(typeof code!=='string'||!/^[A-Z0-9_-]{2,48}$/.test(code))throw Error('INCIDENT_CODE');
   const active=incidents.find(i=>i.moduleId===moduleId&&i.code===code&&i.closedAt===null);
   if(active)throw Error('INCIDENT_ALREADY_OPEN');
   const entry={id:++sequence,moduleId,code,reason:safeNote(reason),openedBy:actor,openedAt:stamp(),closedAt:null,closedBy:null,closureReason:null,persisted:false};
   incidents.push(entry);return copy(entry);
  },
  closeIncident({id,actor,reason}){
   online();operator(actor);
   if(!Number.isSafeInteger(id)||id<=0)throw Error('INCIDENT_ID');
   const entry=incidents.find(i=>i.id===id);if(!entry||entry.closedAt!==null)throw Error('INCIDENT_NOT_OPEN');
   entry.closedAt=stamp();entry.closedBy=actor;entry.closureReason=safeNote(reason);return copy(entry);
  },
  status(){online();return {mode:'LABORATORIO_LOCAL',persisted:false,remoteHealth:'unknown',modules:registry.list().length,observations:copy(observations),incidents:copy(incidents)};}
 });
}
