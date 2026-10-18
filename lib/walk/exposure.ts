/** Exposure requires at least 50% of the stop header for one uninterrupted visible second. */
export function exposureGate(deps:{visible():boolean;schedule(work:()=>void,ms:number):unknown;cancel(id:unknown):void;notify():void}){
 let ratio=0,pending:unknown=null,fired=false,disposed=false;
 const update=()=>{
  if(pending!==null){deps.cancel(pending);pending=null;}
  if(!disposed&&!fired&&ratio>=0.5&&deps.visible())pending=deps.schedule(()=>{
   pending=null;if(!disposed&&!fired&&ratio>=0.5&&deps.visible()){fired=true;deps.notify();}
  },1000);
 };
 return {intersection(value:number){ratio=value;update();},visibilityChanged:update,dispose(){disposed=true;update();}};
}
