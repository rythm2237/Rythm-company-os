import {unzipSync} from "fflate";
export async function privateContractText(bytes:Uint8Array,mime:string):Promise<string> {
 if(!bytes.length||bytes.length>10*1024*1024)throw Error("Use a contract up to 10 MB for profile extraction.");
 if(mime==="text/plain")return new TextDecoder("utf-8",{fatal:true}).decode(bytes).slice(0,150000);
 if(mime==="application/pdf"){
  const {getDocumentProxy,extractText}=await import("unpdf");const pdf=await getDocumentProxy(bytes);
  try{if(pdf.numPages>30)throw Error("Use a contract up to 30 pages.");const result=await extractText(pdf,{mergePages:true});return result.text.slice(0,150000);}finally{await pdf.cleanup();}
 }
 if(mime==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
  const files=unzipSync(bytes,{filter:file=>file.name==="word/document.xml"&&file.originalSize<=2*1024*1024});
  const xml=files["word/document.xml"];if(!xml)throw Error("The Word document could not be read within the extraction limits.");
  return new TextDecoder().decode(xml).replace(/<\/w:p>/g,"\n").replace(/<[^>]*>/g,"").replace(/&(?:amp|lt|gt|quot|apos);/g,v=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"})[v]||v).slice(0,150000);
 }
 throw Error("Use a PDF, DOCX or UTF-8 TXT contract.");
}
