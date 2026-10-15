export type ProgramMeasurement={id:string;metric_name:string;measurement_kind:string;source:string;value:number|null;unit:string|null;measurement_start:string|null;measurement_end:string|null;segmentation:unknown};
/** Only compare recorded metrics sharing source, unit, segmentation and window length. */
export function compareProgramMeasurements(rows:ProgramMeasurement[]){
 const key=(m:ProgramMeasurement)=>JSON.stringify([m.metric_name,m.source,m.unit,m.segmentation]);
 const duration=(m:ProgramMeasurement)=>m.measurement_start&&m.measurement_end?new Date(m.measurement_end).getTime()-new Date(m.measurement_start).getTime():null;
 const comparisons=rows.filter(m=>m.measurement_kind==="outcome"&&m.value!==null).flatMap(after=>{
  const before=rows.filter(m=>m.measurement_kind==="baseline"&&m.value!==null&&key(m)===key(after)&&duration(m)!==null&&duration(m)===duration(after)&&(m.measurement_end!==null&&after.measurement_start!==null&&new Date(m.measurement_end).getTime()<=new Date(after.measurement_start).getTime())).sort((a,b)=>(b.measurement_end??"").localeCompare(a.measurement_end??""))[0];
  if(!before||before.value===null||after.value===null)return [];
  return [{metric:after.metric_name,source:after.source,unit:after.unit,baselineId:before.id,outcomeId:after.id,before:before.value,after:after.value,observedChange:after.value-before.value,observedChangePercent:before.value===0?null:100*(after.value-before.value)/Math.abs(before.value),causality:"not_established" as const}];
 });
 return {measurements:rows,comparisons,sufficientForTrendProposal:comparisons.length>0};
}
