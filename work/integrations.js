// Install approved providers in this file after publisher registration.
// Both adapters are off by default. No network requests or cookies are created here.
const publisher={analytics:null,ad:null,adEvery:8,adPosition:'after-result'};
let completed=0;
window.addEventListener('closet:event',({detail})=>{
  try{publisher.analytics?.(detail);}catch{}
  if(detail.name!=='completed'||!publisher.ad || ++completed%Math.max(1,publisher.adEvery))return;
  const anchor=document.getElementById(publisher.adPosition);
  if(!anchor)return;
  try{Promise.resolve(publisher.ad(anchor)).catch(()=>anchor.replaceChildren());}catch{anchor.replaceChildren();}
});
