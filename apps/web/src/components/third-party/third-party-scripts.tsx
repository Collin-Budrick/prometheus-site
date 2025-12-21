import { Fragment, component$ } from '@builder.io/qwik'
import { featureFlags } from '../../config/feature-flags'
import { thirdPartyScripts } from '../../config/third-party'

const idleLoader = (id: string, src: string) =>
  `(()=>{const url='${src}';let loaded=false;const load=()=>{if(loaded||!url)return;loaded=true;const s=document.createElement('script');s.src=url;s.async=true;s.dataset.thirdParty='${id}';document.body.appendChild(s);};const prime=()=>{load();cleanup();};const cleanup=()=>events.forEach((event)=>window.removeEventListener(event,prime,opts));const events=['pointerdown','keydown','touchstart','focusin'];const opts={once:true,passive:true};events.forEach((event)=>window.addEventListener(event,prime,opts));if('requestIdleCallback'in window){requestIdleCallback(()=>prime(),{timeout:5000});}else{setTimeout(prime,5000);}setTimeout(load,8000);})();`

const consentLoader = (entries: typeof thirdPartyScripts, partytownEnabled: boolean) => {
  const payload = JSON.stringify(
    entries.map((entry) => ({
      id: entry.id,
      src: entry.src,
      inline: entry.inline,
      attributes: entry.attributes,
      partytown: entry.partytown
    }))
  )

  return `(()=>{const entries=${payload};const partytownEnabled=${partytownEnabled ? 'true' : 'false'};const consentKey='prometheus:third-party-consent';let loaded=false;const hasConsent=()=>{try{return localStorage.getItem(consentKey)==='granted'}catch{return false}};const setConsent=()=>{try{localStorage.setItem(consentKey,'granted')}catch{}};const target=document.head||document.body||document.documentElement;const setAttrs=(script,attrs)=>{if(!attrs)return;for(const key in attrs){const value=attrs[key];if(value===undefined||value===false)continue;const name=key==='crossOrigin'?'crossorigin':key==='referrerPolicy'?'referrerpolicy':key==='fetchPriority'?'fetchpriority':key;if(value===true){script.setAttribute(name,'')}else{script.setAttribute(name,String(value))}}};const inject=(entry)=>{if(!entry||(!entry.src&&!entry.inline))return;const type=partytownEnabled&&entry.partytown?'text/partytown':'';if(entry.src){const script=document.createElement('script');if(type)script.type=type;script.src=entry.src;script.async=true;script.dataset.thirdParty=entry.id;setAttrs(script,entry.attributes);target.appendChild(script)}if(entry.inline){const script=document.createElement('script');if(type)script.type=type;script.dataset.thirdParty=entry.id;setAttrs(script,entry.attributes);script.text=entry.inline;target.appendChild(script)}};const loadAll=()=>{if(loaded)return;loaded=true;entries.forEach(inject)};const cleanup=()=>{window.removeEventListener('prometheus:third-party-consent',onConsent);document.removeEventListener('click',onClick,true)};const grant=()=>{setConsent();loadAll();cleanup()};const onConsent=(event)=>{const detail=event&&event.detail;if(detail&&detail!=='granted'&&detail!==true&&detail.status!=='granted')return;grant()};const onClick=(event)=>{const target=event.target;if(!target||!target.closest)return;const el=target.closest('[data-third-party-consent]');if(!el)return;const value=el.getAttribute('data-third-party-consent');if(value&&value!=='grant'&&value!=='granted'&&value!=='accept')return;grant()};if(hasConsent()){loadAll();return}window.addEventListener('prometheus:third-party-consent',onConsent,{once:true});document.addEventListener('click',onClick,true)})();`
}

export const ThirdPartyScripts = component$(() => {
  const partytownEnabled = featureFlags.partytown
  const entries = thirdPartyScripts
  const isPreview = import.meta.env.PROD
  const consentEntries = isPreview ? entries.filter((entry) => entry.load === 'interaction') : []
  const immediateEntries = isPreview ? entries.filter((entry) => entry.load !== 'interaction') : entries

  if (!entries.length) {
    return null
  }

  return (
    <>
      {isPreview && consentEntries.length > 0 && (
        <script dangerouslySetInnerHTML={consentLoader(consentEntries, partytownEnabled)} />
      )}
      {immediateEntries.map((entry) => {
        if (!entry.src && !entry.inline) return null

        const baseProps = entry.attributes ?? {}

        if (entry.partytown && partytownEnabled) {
          return (
            <Fragment key={entry.id}>
              {entry.src && <script type="text/partytown" {...baseProps} src={entry.src} />}
              {entry.inline && (
                <script type="text/partytown" {...baseProps} dangerouslySetInnerHTML={entry.inline} />
              )}
            </Fragment>
          )
        }

        if (!isPreview && entry.load === 'interaction' && entry.src) {
          return <script key={`${entry.id}-loader`} dangerouslySetInnerHTML={idleLoader(entry.id, entry.src)} />
        }

        const loadProps = entry.load === 'defer' ? { defer: true } : { async: true }

        return (
          <Fragment key={entry.id}>
            {entry.src && <script {...baseProps} {...loadProps} src={entry.src} />}
            {entry.inline && <script {...baseProps} {...loadProps} dangerouslySetInnerHTML={entry.inline} />}
          </Fragment>
        )
      })}
    </>
  )
})
