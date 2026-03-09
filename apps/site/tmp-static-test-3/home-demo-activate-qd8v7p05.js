import{p as W,q as O,r as F,s as G}from"./home-static-entry-23zv7spq.js";import"./home-static-entry-8rn5xagm.js";var U=["0101","1100","0011","1010","0110","1001","0001","1110"],Q=720,P=60,_=["Fragment","Card","Title","Copy","Badge"],z="<section> <h2> <p> <div.badge>",B=()=>{return document.documentElement.lang?.trim().toLowerCase()||"en"},J=(e)=>{if(!(e instanceof HTMLElement))throw Error("Home demo activation requires an element root");return e},K=(e,t)=>{let a=document.createElement("span");return a.className=e,a.textContent=t,a},X=(e=4)=>{let t="";for(let a=0;a<e;a+=1)t+=Math.random()>0.5?"1":"0";return t},V=(e)=>Object.fromEntries(e.map((t)=>[t.id,Math.random()>0.45])),q=(e,t,a)=>Math.min(a,Math.max(t,e)),I=(e,t)=>{let a=(e*5+t*3)%1024,d=120+a%280,L=60+a%40,u=(a*2654435761>>>0).toString(16).padStart(8,"0");return{mixed:a,throughput:d,hotPath:L,hash:u}},Y=(e,t)=>{if(!e)return;e.textContent=t},Z=(e,t)=>{e.replaceChildren(K("react-binary-step-dot",""));let a=e.querySelector(".react-binary-step-dot");if(a)a.setAttribute("aria-hidden","true"),a.textContent="";e.append(document.createTextNode(t))},j=(e)=>e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),k=(e,t,a)=>{e.className=t,e.setAttribute("data-home-demo-active","true"),e.removeAttribute("data-home-preview"),e.innerHTML=a},ee=(e)=>`
  <div class="planner-demo-header">
    <div class="planner-demo-title"></div>
    <div class="planner-demo-controls">
      <button class="planner-demo-action" type="button"></button>
      <button class="planner-demo-secondary" type="button"></button>
    </div>
  </div>
  <div class="planner-demo-status" aria-live="polite"></div>
  <div class="planner-demo-steps" role="list">
    ${e.steps.map(()=>'<div class="planner-demo-step" role="listitem"></div>').join("")}
  </div>
  <div class="planner-demo-grid">
    ${e.fragments.map(()=>`
          <div class="planner-demo-card" data-cache="hit" data-render="idle" data-revalidate="idle">
            <div class="planner-demo-row">
              <span class="planner-demo-value"></span>
              <span class="planner-demo-pill" data-state="idle"></span>
            </div>
            <div class="planner-demo-row">
              <button class="planner-demo-toggle" type="button" data-state="hit"></button>
              <span class="planner-demo-pill" data-state="idle"></span>
            </div>
            <div class="planner-demo-row">
              <span class="planner-demo-pill" data-state="idle"></span>
            </div>
            <div class="planner-demo-outcomes">
              <div class="planner-demo-outcome" data-state="idle"></div>
              <div class="planner-demo-outcome is-muted" data-state="idle"></div>
            </div>
          </div>
        `).join("")}
  </div>
`,te=()=>`
  <div class="wasm-demo-header">
    <div class="wasm-demo-title"></div>
    <button class="wasm-demo-action" type="button"></button>
  </div>
  <div class="wasm-demo-subtitle"></div>
  <div class="wasm-demo-grid">
    <div class="wasm-demo-panel" data-panel="inputs">
      <div class="wasm-demo-panel-title"></div>
      <div class="wasm-demo-input">
        <span class="wasm-demo-label">A</span>
        <button class="wasm-demo-step" type="button"></button>
        <span class="wasm-demo-value"></span>
        <button class="wasm-demo-step" type="button"></button>
      </div>
      <div class="wasm-demo-input">
        <span class="wasm-demo-label">B</span>
        <button class="wasm-demo-step" type="button"></button>
        <span class="wasm-demo-value"></span>
        <button class="wasm-demo-step" type="button"></button>
      </div>
      <div class="wasm-demo-note"></div>
    </div>
    <div class="wasm-demo-panel" data-panel="wasm">
      <div class="wasm-demo-panel-title"></div>
      <div class="wasm-demo-core">
        <div class="wasm-demo-core-value" aria-live="polite"></div>
        <div class="wasm-demo-core-hash"></div>
      </div>
      <div class="wasm-demo-bits"></div>
      <div class="wasm-demo-note"></div>
    </div>
    <div class="wasm-demo-panel" data-panel="fragment">
      <div class="wasm-demo-panel-title"></div>
      <div class="wasm-demo-metrics">
        <div class="wasm-demo-metric" role="group"></div>
        <div class="wasm-demo-metric" role="group"></div>
      </div>
      <div class="wasm-demo-bar">
        <div class="wasm-demo-bar-fill"></div>
      </div>
      <div class="wasm-demo-history"></div>
      <div class="wasm-demo-note"></div>
    </div>
  </div>
  <div class="wasm-demo-footer">
    <span class="wasm-demo-chip"></span>
    <span class="wasm-demo-chip"></span>
    <span class="wasm-demo-chip"></span>
  </div>
`,ae=(e)=>`
  <div class="react-binary-header">
    <div class="react-binary-controls">
      <div class="react-binary-title">${j(e.title)}</div>
      <button class="react-binary-action" type="button"></button>
    </div>
    <div class="react-binary-status" aria-live="polite"></div>
  </div>
  <div class="react-binary-steps" role="tablist" aria-label="${j(e.ariaStages)}">
    ${e.stages.map((t,a)=>`<button class="react-binary-step" type="button" role="tab" aria-selected="${a===0?"true":"false"}"></button>`).join("")}
  </div>
  <div class="react-binary-track">
    <div class="react-binary-panel" data-panel="react">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-node-tree">
        <div class="react-binary-node"></div>
        <div class="react-binary-node is-child"></div>
        <div class="react-binary-node is-child"></div>
        <div class="react-binary-node is-child"></div>
        <div class="react-binary-node is-child"></div>
      </div>
      <div class="react-binary-caption"></div>
    </div>
    <div class="react-binary-connector" aria-hidden="true"></div>
    <div class="react-binary-panel" data-panel="binary">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-bits" role="group" aria-label="${j(e.footer.binaryStream)}">
        <span data-anim="false"></span>
      </div>
      <div class="react-binary-caption"></div>
    </div>
    <div class="react-binary-connector" aria-hidden="true"></div>
    <div class="react-binary-panel" data-panel="qwik">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-dom">
        <span></span>
      </div>
      <div class="react-binary-caption"></div>
    </div>
  </div>
  <div class="react-binary-footer">
    <span class="react-binary-chip"></span>
    <span class="react-binary-chip"></span>
  </div>
`,ne=()=>`
  <div class="preact-island-label"></div>
  <div class="preact-island-timer" aria-live="polite"></div>
  <div class="preact-island-stage">
    <svg class="preact-island-dial" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="preact-island-dial-track" cx="60" cy="60" r="48"></circle>
      <circle class="preact-island-dial-ticks" cx="60" cy="60" r="48"></circle>
      <circle class="preact-island-dial-progress" cx="60" cy="60" r="48"></circle>
      <line class="preact-island-dial-hand" x1="60" y1="60" x2="60" y2="16"></line>
      <circle class="preact-island-dial-center-dot" cx="60" cy="60" r="4"></circle>
    </svg>
    <div class="preact-island-stage-title"></div>
    <div class="preact-island-stage-time" aria-live="polite"></div>
    <div class="preact-island-stage-sub"></div>
  </div>
  <button class="preact-island-action" type="button"></button>
`,se=(e)=>{let t=W(B());k(e,"planner-demo",ee(t));let a=e.querySelector(".planner-demo-title"),d=e.querySelector(".planner-demo-action"),L=e.querySelector(".planner-demo-secondary"),u=e.querySelector(".planner-demo-status"),h=Array.from(e.querySelectorAll(".planner-demo-step")),i=Array.from(e.querySelectorAll(".planner-demo-card")),m=-1,r=!1,C=0,y=!1,c=V(t.fragments),v=()=>{if(!C)return;window.clearTimeout(C),C=0},H=()=>m>=1,T=()=>m>=2,g=()=>m>=3,f=()=>m>=4,w=(n,l)=>{let s=c[l.id]??!1,E=g()?s?"skip":"render":"idle",M=f()?s?"queued":"fresh":"idle",S=Array.from(n.querySelectorAll(".planner-demo-row")),x=Array.from(n.querySelectorAll(".planner-demo-outcome")),A=n.querySelector(".planner-demo-toggle");n.dataset.cache=s?"hit":"miss",n.dataset.render=E,n.dataset.revalidate=M,n.dataset.title=l.label,n.dataset.meta=l.id,S[0]?.setAttribute("data-label",t.labels.dependencies),S[1]?.setAttribute("data-label",t.labels.cache),S[2]?.setAttribute("data-label",t.labels.runtime);let N=S[0]?.querySelector(".planner-demo-value");if(N)N.textContent=l.deps.length?l.deps.join(" + "):t.root;let D=S[0]?.querySelector(".planner-demo-pill");if(D)D.dataset.state=m>=0?"ready":"idle",D.textContent=m>=0?t.resolved:t.pending;if(A)A.dataset.cacheId=l.id,A.dataset.state=s?"hit":"miss",A.disabled=!1,A.textContent=s?t.hit:t.miss;let R=S[1]?.querySelector(".planner-demo-pill");if(R)R.dataset.state=H()?"ready":"idle",R.textContent=H()?t.checked:t.waitingCache;let $=S[2]?.querySelector(".planner-demo-pill");if($)$.dataset.state=T()?"ready":"idle",$.textContent=T()?l.runtime:t.selecting;if(x[0])x[0].dataset.state=E,x[0].textContent=E==="render"?t.renderNow:E==="skip"?t.skipRender:t.awaitRender;if(x[1])x[1].dataset.state=M,x[1].textContent=M==="queued"?t.revalidateQueued:M==="fresh"?t.freshRender:t.awaitRevalidate},b=()=>{let n=m>=0?t.steps[m]:null;if(e.dataset.preview="false",e.dataset.stage=n?.id??"idle",a)a.textContent=t.title;if(d)d.disabled=r,d.dataset.action="run",d.removeAttribute("data-demo-activate"),d.textContent=r?t.running:t.run;if(L)L.disabled=!1,L.dataset.action="shuffle",L.textContent=t.shuffle;if(u)u.textContent=n?n.hint:t.waiting;h.forEach((l,s)=>{l.classList.toggle("is-active",m===s),l.classList.toggle("is-done",m>s),l.textContent=t.steps[s]?.label??""}),i.forEach((l,s)=>{let E=t.fragments[s];if(!E)return;w(l,E)})},o=(n)=>{if(y)return;if(n>=t.steps.length){r=!1,v(),b();return}m=n,b(),C=window.setTimeout(()=>{C=0,o(n+1)},Q)},p=(n)=>{let l=n.target?.closest("button");if(!l||!e.contains(l))return;let s=l.dataset.cacheId;if(s){c={...c,[s]:!c[s]},b();return}let E=l.dataset.action;if(E==="shuffle"){c=V(t.fragments),b();return}if(E!=="run"||r)return;r=!0,o(0),b()};return e.addEventListener("click",p),b(),{cleanup:()=>{y=!0,v(),e.removeEventListener("click",p)}}},ie=(e)=>{let t=O(B());k(e,"wasm-demo",te());let a=e.querySelector(".wasm-demo-title"),d=e.querySelector(".wasm-demo-action"),L=e.querySelector(".wasm-demo-subtitle"),u=Array.from(e.querySelectorAll(".wasm-demo-panel-title")),h=Array.from(e.querySelectorAll(".wasm-demo-value")),i=Array.from(e.querySelectorAll(".wasm-demo-step")),m=Array.from(e.querySelectorAll(".wasm-demo-note")),r=Array.from(e.querySelectorAll(".wasm-demo-metric")),C=e.querySelector(".wasm-demo-bar-fill"),y=e.querySelector(".wasm-demo-history"),c=e.querySelector(".wasm-demo-core"),v=e.querySelector(".wasm-demo-core-value"),H=e.querySelector(".wasm-demo-core-hash"),T=e.querySelector(".wasm-demo-bits"),g=Array.from(e.querySelectorAll(".wasm-demo-chip")),f=128,w=256,b=[I(f,w).mixed],o=0,p=()=>{let s=I(f,w),E=Math.min(100,Math.max(0,s.hotPath));if(e.dataset.preview="false",a)a.textContent=t.title;if(Y(d,t.run),d?.removeAttribute("data-demo-activate"),d?.setAttribute("data-action","run"),d)d.disabled=!1;if(L)L.textContent=t.subtitle;if(u[0]&&(u[0].textContent=t.panels.inputs),u[1]&&(u[1].textContent=t.panels.wasm),u[2]&&(u[2].textContent=t.panels.fragment),h[0])h[0].textContent=`${f}`;if(h[1])h[1].textContent=`${w}`;if(i[0])i[0].disabled=!1,i[0].dataset.action="a-dec",i[0].setAttribute("aria-label",t.aria.decreaseA),i[0].textContent="-";if(i[1])i[1].disabled=!1,i[1].dataset.action="a-inc",i[1].setAttribute("aria-label",t.aria.increaseA),i[1].textContent="+";if(i[2])i[2].disabled=!1,i[2].dataset.action="b-dec",i[2].setAttribute("aria-label",t.aria.decreaseB),i[2].textContent="-";if(i[3])i[3].disabled=!1,i[3].dataset.action="b-inc",i[3].setAttribute("aria-label",t.aria.increaseB),i[3].textContent="+";if(v)v.textContent=`${s.mixed}`;if(H)H.textContent=`hash ${s.hash}`;if(T)T.textContent=s.mixed.toString(2).padStart(12,"0");if(m[0]&&(m[0].textContent=t.notes.inputs),m[1]&&(m[1].textContent=t.notes.wasm),m[2]&&(m[2].textContent=t.notes.fragment),r[0])r[0].dataset.label=t.metrics.burst,r[0].dataset.value=`${s.throughput} op/s`,r[0].setAttribute("aria-label",`${t.metrics.burst} ${s.throughput} op/s`);if(r[1])r[1].dataset.label=t.metrics.hotPath,r[1].dataset.value=`${s.hotPath} pts`,r[1].setAttribute("aria-label",`${t.metrics.hotPath} ${s.hotPath} pts`);if(C)C.style.width=`${E}%`;if(y)y.replaceChildren(...b.map((M)=>K("",`${M}`)));g[0]&&(g[0].textContent=t.footer.edgeSafe),g[1]&&(g[1].textContent=t.footer.deterministic),g[2]&&(g[2].textContent=t.footer.htmlUntouched)},n=()=>{if(c?.classList.add("is-active"),o)window.clearTimeout(o);o=window.setTimeout(()=>{o=0,c?.classList.remove("is-active")},320)},l=(s)=>{let E=s.target?.closest("button");if(!E||!e.contains(E))return;switch(E.dataset.action){case"a-dec":f=q(f-16,32,512),p();return;case"a-inc":f=q(f+16,32,512),p();return;case"b-dec":w=q(w-16,32,512),p();return;case"b-inc":w=q(w+16,32,512),p();return;case"run":{b=[I(f,w).mixed,...b].slice(0,3),p(),n();return}default:return}};return e.addEventListener("click",l),p(),{cleanup:()=>{if(o)window.clearTimeout(o);e.removeEventListener("click",l)}}},le=(e)=>{let t=F(B());k(e,"react-binary-demo",ae(t));let a=e.querySelector(".react-binary-action"),d=e.querySelector(".react-binary-status"),L=Array.from(e.querySelectorAll(".react-binary-step")),u=Array.from(e.querySelectorAll(".react-binary-panel-title")),h=Array.from(e.querySelectorAll(".react-binary-caption")),i=Array.from(e.querySelectorAll(".react-binary-chip")),m=Array.from(e.querySelectorAll(".react-binary-node")),r=e.querySelector(".react-binary-bits span"),C=e.querySelector(".react-binary-dom span"),y=0,c=[...U],v=0,H=()=>{if(!v)return;window.clearTimeout(v),v=0},T=()=>{if(c=c.map((o)=>X(o.length)),r)r.textContent=c.join(" ")},g=()=>{if(v)return;if(document.visibilityState!=="visible")return;if(t.stages[y]?.id!=="binary")return;v=window.setTimeout(()=>{v=0,T(),g()},700)},f=()=>{let o=t.stages[y]??t.stages[0],p=t.actions[o.id]??t.actions.react;if(e.dataset.preview="false",e.dataset.stage=o.id,a)a.disabled=!1,a.dataset.action="advance",a.removeAttribute("data-demo-activate"),a.textContent=p;if(d)d.textContent=o.hint;if(L.forEach((n,l)=>{let s=t.stages[l];if(!s)return;n.disabled=!1,n.dataset.stageIndex=`${l}`,n.setAttribute("aria-selected",l===y?"true":"false"),n.tabIndex=l===y?0:-1,Z(n,s.label)}),u[0]&&(u[0].textContent=t.panels.reactTitle),u[1]&&(u[1].textContent=t.panels.binaryTitle),u[2]&&(u[2].textContent=t.panels.qwikTitle),h[0]&&(h[0].textContent=t.panels.reactCaption),h[1]&&(h[1].textContent=t.panels.binaryCaption),h[2]&&(h[2].textContent=t.panels.qwikCaption),i[0]&&(i[0].textContent=t.footer.hydrationSkipped),i[1]&&(i[1].textContent=t.footer.binaryStream),m.forEach((n,l)=>{n.textContent=_[l]??""}),C)C.textContent=z;if(r)r.dataset.anim=o.id==="binary"?"true":"false",r.textContent=c.join(" ");if(H(),o.id==="binary")T(),g()},w=(o)=>{let p=o.target?.closest("button");if(!p||!e.contains(p))return;if(p.dataset.action==="advance"){y=(y+1)%t.stages.length,f();return}if(typeof p.dataset.stageIndex==="string"){let n=Number.parseInt(p.dataset.stageIndex,10);if(Number.isFinite(n)&&n>=0&&n<t.stages.length)y=n,f()}},b=()=>{if(document.visibilityState==="visible")g();else H()};return e.addEventListener("click",w),document.addEventListener("visibilitychange",b),f(),{cleanup:()=>{H(),e.removeEventListener("click",w),document.removeEventListener("visibilitychange",b)}}},re=(e,t)=>{let a=G(B()),d=typeof t.label==="string"&&t.label.trim()?t.label:a.label;k(e,"preact-island-ui",ne());let L=e.querySelector(".preact-island-label"),u=e.querySelector(".preact-island-timer"),h=e.querySelector(".preact-island-stage-title"),i=e.querySelector(".preact-island-stage-time"),m=e.querySelector(".preact-island-stage-sub"),r=e.querySelector(".preact-island-action"),C=e.querySelector(".preact-island-dial-progress"),y=e.querySelector(".preact-island-dial-hand"),c=P,v=0,H=()=>{if(!v)return;window.clearTimeout(v),v=0},T=()=>{if(v)return;if(document.visibilityState!=="visible")return;if(c<=0)return;v=window.setTimeout(()=>{v=0,c=Math.max(0,c-1),g(),T()},1000)},g=()=>{let b=Math.floor(c/60),o=String(c%60).padStart(2,"0"),p=c/P,n=Math.round(2*Math.PI*48),l=Math.round(n*(1-p)),s=Math.round((1-p)*-360);if(e.dataset.preview="false",e.dataset.running=c>0?"true":"false",L&&(L.textContent=d),h&&(h.textContent=a.countdown),u&&(u.textContent=c===0?a.ready:`${b}:${o}`),i&&(i.textContent=c===0?"0:00":`${b}:${o}`),m&&(m.textContent=c===0?a.readySub:a.activeSub),r)r.disabled=!1,r.removeAttribute("data-demo-activate"),r.textContent=a.reset;if(C)C.style.strokeDasharray=`${n}`,C.style.strokeDashoffset=`${l}`;if(y)y.style.transform=`rotate(${s}deg)`,y.style.transformOrigin="60px 60px"},f=(b)=>{let o=b.target?.closest("button");if(!o||!e.contains(o))return;c=P,g(),T()},w=()=>{if(document.visibilityState==="visible")T();else H()};return e.addEventListener("click",f),document.addEventListener("visibilitychange",w),g(),T(),{cleanup:()=>{H(),e.removeEventListener("click",f),document.removeEventListener("visibilitychange",w)}}},oe=async({root:e,kind:t,props:a})=>{let d=J(e);switch(t){case"planner":return se(d);case"wasm-renderer":return ie(d);case"react-binary":return le(d);case"preact-island":return re(d,a);default:throw Error(`Unsupported home demo: ${t}`)}};export{oe as activateHomeDemo};
