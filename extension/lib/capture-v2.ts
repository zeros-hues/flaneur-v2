import { CAPTURE_V2_HTML_BYTES,CAPTURE_V2_REQUEST_BYTES } from "../../lib/capture/v2-limits";
export interface CaptureEnvelope {version:2;requestId:string;adapterId:"linkedin";kind:"profile_page"|"social_post";sourceUrl:string;html:string;
 reasonForNoticing:string|null;urn:string|null;extensionVersion:string;clientCapturedAt:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(value:unknown,max:number):value is string=>typeof value==="string"&&value.length>0&&value.length<=max&&!value.includes("\0")&&
 !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
export function linkedinPage(value:unknown):boolean {
 try{const url=new URL(String(value));return url.protocol==="https:"&&!url.username&&!url.password&&(url.hostname==="linkedin.com"||url.hostname.endsWith(".linkedin.com"));}catch{return false;}
}
export function validateCapture(value:unknown):CaptureEnvelope {
 if(typeof value!=="object"||value===null)throw new Error("CAPTURE_INVALID");
 const v=value as Record<string,unknown>,keys=["version","requestId","adapterId","kind","sourceUrl","html","reasonForNoticing","urn","extensionVersion","clientCapturedAt"];
 if(Object.keys(v).length!==keys.length||keys.some(key=>!(key in v))||v.version!==2||!text(v.requestId,36)||!uuid.test(v.requestId)||v.adapterId!=="linkedin"||
  !["profile_page","social_post"].includes(String(v.kind))||!text(v.sourceUrl,8000)||!linkedinPage(v.sourceUrl)||!text(v.html,CAPTURE_V2_HTML_BYTES)||
  (v.reasonForNoticing!==null&&!text(v.reasonForNoticing,5000))||(v.urn!==null&&(typeof v.urn!=="string"||v.urn.length>256||!/^urn:li:[A-Za-z]+:\d+$/.test(v.urn)))||
  (v.kind==="profile_page"&&v.urn!==null)||!text(v.extensionVersion,32)||typeof v.clientCapturedAt!=="string"||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v.clientCapturedAt)||!Number.isFinite(Date.parse(v.clientCapturedAt)))throw new Error("CAPTURE_INVALID");
 const result:CaptureEnvelope={version:2,requestId:v.requestId.toLowerCase(),adapterId:"linkedin",kind:v.kind as CaptureEnvelope["kind"],sourceUrl:v.sourceUrl,
  html:v.html,reasonForNoticing:v.reasonForNoticing as string|null,urn:v.urn as string|null,extensionVersion:v.extensionVersion,clientCapturedAt:v.clientCapturedAt};
 const encoder=new TextEncoder();if(encoder.encode(result.html).length>CAPTURE_V2_HTML_BYTES||encoder.encode(JSON.stringify(result)).length>CAPTURE_V2_REQUEST_BYTES)throw new Error("CAPTURE_TOO_LARGE");
 return result;
}
export async function payloadHash(payload:CaptureEnvelope){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(payload))))).map(byte=>byte.toString(16).padStart(2,"0")).join("");}
