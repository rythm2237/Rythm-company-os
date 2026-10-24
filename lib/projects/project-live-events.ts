/** Public operational events only. API callers must already pass organization/project authorization. */
export type ProjectLiveEvent={id:string;event_type:string;headline:string;detail:string|null;importance:string;created_at:string;agent_id?:string|null;metadata?:Record<string,unknown>};
export type EventCursor={createdAt:string;id:string};
export function compareProjectEvents(a:Pick<ProjectLiveEvent,"id"|"created_at">,b:Pick<ProjectLiveEvent,"id"|"created_at">){return a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);}
export function encodeEventCursor(event:Pick<ProjectLiveEvent,"id"|"created_at">){return `${event.created_at}|${event.id}`;}
export function parseEventCursor(value:string|null):EventCursor|null{
 if(!value)return null;
 const [createdAt,id,...rest]=value.split("|");
 if(rest.length||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(createdAt)||!Number.isFinite(Date.parse(createdAt))||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return null;
 return {createdAt,id};
}
export function mergeProjectEvents(current:ProjectLiveEvent[],incoming:ProjectLiveEvent[],limit=100){
 const rows=new Map(current.map(event=>[event.id,event]));for(const event of incoming)rows.set(event.id,event);
 return [...rows.values()].sort(compareProjectEvents).slice(-limit);
}
export function handoffEndpoints(event:ProjectLiveEvent){
 const source=event.metadata?.source_agent_id,target=event.metadata?.target_agent_id;
 return event.event_type==="task.handoff"&&typeof source==="string"&&typeof target==="string"?{source,target}:null;
}
