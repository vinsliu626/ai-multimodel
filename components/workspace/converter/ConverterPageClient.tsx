"use client";

import React,{useEffect,useMemo,useState}from"react";
import{useSearchParams}from"next/navigation";
import{useSession}from"next-auth/react";
import{ConverterUI,type ConverterEntitlement}from"@/components/workspace/converter/ConverterUI";
import{getConverterPlanLimits}from"@/lib/plans/productLimits";

function buildEntitlement(plan:"basic"|"pro"|"ultra",usedToday:number):ConverterEntitlement{
  const limits=getConverterPlanLimits(plan);
  return{plan,usedConverterCountToday:usedToday,converterConversionsPerDay:limits.conversionsPerDay,converterMaxFileSizeBytes:limits.maxFileSizeBytes,converterBatchMaxFiles:limits.batchMaxFiles,converterAllowAdvancedVideo:limits.allowAdvancedVideo,converterAllowLinkToAudio:limits.allowLinkToAudio,converterPriority:limits.priority};
}

export function ConverterPageClient({allowE2E}:{allowE2E:boolean}){
  const searchParams=useSearchParams();
  const {data:session,status}=useSession();
  const [entitlement,setEntitlement]=useState<ConverterEntitlement|null>(null);
  const [loading,setLoading]=useState(false);
  const [lang,setLang]=useState<"en"|"zh">("en");
  const [settingsOpen,setSettingsOpen]=useState(false);
  const isZh=lang==="zh";
  const t=isZh?{back:"返回聊天",privacy:"隐私政策",settings:"设置",title:"转换工作区",subtitle:"独立的文件转换空间，支持语言切换与本地隐私控制。",lang:"语言",clear:"清除本地设置",done:"完成",loading:"正在加载转换器..."}:{back:"Back to chat",privacy:"Privacy policy",settings:"Settings",title:"Converter workspace",subtitle:"A dedicated file conversion space with language switching and local privacy controls.",lang:"Language",clear:"Clear local settings",done:"Done",loading:"Loading Converter..."};

  const e2eEnabled=allowE2E&&searchParams.get("e2e")==="1";
  const e2ePlanParam=searchParams.get("plan");
  const e2ePlan=e2ePlanParam==="pro"||e2ePlanParam==="ultra"?e2ePlanParam:"basic";
  const e2eUsedToday=Number.parseInt(searchParams.get("usedToday")??"0",10)||0;
  const e2eForceFailure=searchParams.get("fail")==="conversion";
  const effectiveLocked=e2eEnabled?false:!session;

  useEffect(()=>{try{const saved=localStorage.getItem("lang");if(saved==="zh"||saved==="en")setLang(saved)}catch{}},[]);
  useEffect(()=>{try{localStorage.setItem("lang",lang)}catch{}},[lang]);

  useEffect(()=>{
    if(e2eEnabled){setEntitlement(buildEntitlement(e2ePlan,e2eUsedToday));return}
    if(!session){setEntitlement(null);return}
    let cancelled=false;setLoading(true);
    fetch("/api/billing/status",{cache:"no-store",credentials:"include"}).then(async response=>{
      const data=await response.json().catch(()=>null);
      if(!cancelled&&response.ok&&data?.ok){
        setEntitlement({plan:data.plan,usedConverterCountToday:data.usedConverterCountToday,converterConversionsPerDay:data.converterConversionsPerDay,converterMaxFileSizeBytes:data.converterMaxFileSizeBytes,converterBatchMaxFiles:data.converterBatchMaxFiles,converterAllowAdvancedVideo:data.converterAllowAdvancedVideo,converterAllowLinkToAudio:data.converterAllowLinkToAudio,converterPriority:data.converterPriority});
      }
    }).finally(()=>{if(!cancelled)setLoading(false)});
    return()=>{cancelled=true};
  },[e2eEnabled,e2ePlan,e2eUsedToday,session]);

  const testMode=useMemo(()=>e2eEnabled?{enabled:true,dailyUsageStorageKey:`nexusdesk.converter.e2e.${e2ePlan}.${e2eUsedToday}`,forceFailure:e2eForceFailure}:null,[e2eEnabled,e2eForceFailure,e2ePlan,e2eUsedToday]);

  function clearLocal(){try{localStorage.removeItem("lang")}catch{}setLang("en")}

  return <div className="min-h-screen bg-[#030303] text-slate-100"><div className="border-b border-white/10 bg-[#060606]/90 backdrop-blur-xl"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8"><div><p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{t.title}</p><p className="mt-1 text-sm text-slate-400">{t.subtitle}</p></div><div className="flex flex-wrap items-center gap-2"><a href="/chat" className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] transition hover:bg-white/10">{t.back}</a><a href="/privacy" className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] transition hover:bg-white/10">{t.privacy}</a><button type="button" onClick={()=>setSettingsOpen(v=>!v)} className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] transition hover:bg-white/10">{t.settings}</button></div></div>{settingsOpen?<div className="mx-auto max-w-6xl px-4 pb-4 md:px-8"><div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4"><div className="flex flex-wrap items-center gap-3"><span className="text-[12px] text-slate-400">{t.lang}</span><button type="button" onClick={()=>setLang("en")} className={["rounded-full px-3 py-1.5 text-[12px]",lang==="en"?"bg-white/10 text-white":"bg-white/5 text-slate-400"].join(" ")}>EN</button><button type="button" onClick={()=>setLang("zh")} className={["rounded-full px-3 py-1.5 text-[12px]",lang==="zh"?"bg-white/10 text-white":"bg-white/5 text-slate-400"].join(" ")}>中文</button><button type="button" onClick={clearLocal} className="ml-auto rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[12px] text-slate-100 transition hover:bg-white/10">{t.clear}</button><button type="button" onClick={()=>setSettingsOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[12px] text-slate-100 transition hover:bg-white/10">{t.done}</button></div></div></div>:null}</div>{loading&&!entitlement&&!effectiveLocked?<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{t.loading}</div>:<ConverterUI isZh={isZh} locked={effectiveLocked||status==="loading"} entitlement={entitlement} testMode={testMode}/>}</div>;
}
