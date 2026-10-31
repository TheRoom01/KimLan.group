/** Browser-side inspection: use only source URLs actually supplied by the UI. */
export function inspectImageSource(image: HTMLImageElement) {
  const current=String(image.currentSrc || image.getAttribute("src") || "").trim();
  const full=["data-original-src","data-original","data-full-src","data-large-src"].map(key=>image.getAttribute(key)||"")
    .find(value=>/^(?:https?:|blob:)/i.test(value)) || "";
  const hint=`${current.split(/[?#]/)[0]} ${image.className || ""} ${image.getAttribute("data-role") || ""}`.toLowerCase();
  const placeholder=!current || /^data:/i.test(current) || /placeholder|skeleton|spinner|transparent|blank(?:\.|-)|loading(?:\.|-)/.test(hint);
  const thumbnail=/thumbnail|(?:^|[/_\s-])thumb(?:[./_\s-]|$)/.test(hint) || image.getAttribute("data-thumbnail")==="true";
  const loaded=image.complete && image.naturalWidth>1 && image.naturalHeight>1;
  return {url:full || current,loaded,quality:placeholder ? "placeholder" : thumbnail && !full ? "thumbnail" : "image",
    usableForRoom:loaded && !placeholder && (!thumbnail || !!full),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};
}
export function mediaReadinessBrowserScript() {
  return `globalThis.__name = globalThis.__name || Object; globalThis.__zaloImageReadiness = {inspectImageSource:(${inspectImageSource.toString()})};`;
}
// Local cached URLs are content-addressed per message. Preserve partial album
// slices seen in different renders instead of choosing the longest viewport.
export function mergeCapturedImages<T extends {url:string;cachedLocalFile?:boolean;usableForRoom?:boolean}>(current:T[],incoming:T[]):T[] {
  const images=new Map<string,T>();
  for(const image of [...current,...incoming]) {
    if(!image.url || image.usableForRoom===false) continue;
    const existing=images.get(image.url);
    if(!existing || image.cachedLocalFile) images.set(image.url,image);
  }
  return [...images.values()];
}
export async function waitForStableMedia<T extends {idCandidates?: string[];text?: string;images?: any[];mediaPendingCount?: number;mediaWarnings?: string[]}>(input: {
  capture:()=>Promise<T[]>;wait:(ms:number)=>Promise<void>;now?:()=>number;quietMs?:number;timeoutMs?:number;retry?:()=>Promise<void>;
  onCapture?:(items:T[])=>Promise<void>;
}): Promise<{items:Array<T & {mediaWarnings?:string[]}>;timedOut:boolean;retried:boolean}> {
  const now=input.now || Date.now, quiet=Math.max(200,input.quietMs || 750),timeout=Math.max(quiet,input.timeoutMs || 7000);
  let latest:T[]=[];
  for(let attempt=0;attempt<(input.retry?2:1);attempt++) {
    const start=now();let changed=start,signature="";
    while(now()-start<=timeout) {
      latest=await input.capture();
      const next=JSON.stringify(latest.map(item=>[item.idCandidates,item.text,item.images?.map(image=>[image.url,image.loaded,image.quality]),item.mediaPendingCount,item.mediaWarnings]));
      await input.onCapture?.(latest);
      if(next!==signature){changed=now();signature=next;}
      if(!latest.some(item=>Number(item.mediaPendingCount)>0) && now()-changed>=quiet) return {items:latest,timedOut:false,retried:attempt>0};
      await input.wait(200);
    }
    if(attempt===0 && input.retry) await input.retry();
  }
  return {items:latest.map(item=>({...item,mediaWarnings:[...(item.mediaWarnings||[]),"MEDIA_LOADING_TIMEOUT"]})),timedOut:true,retried:!!input.retry};
}
