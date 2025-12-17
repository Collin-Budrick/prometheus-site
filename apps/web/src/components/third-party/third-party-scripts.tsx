import { Partytown } from '@builder.io/partytown/integration'
import { Fragment, component$ } from '@builder.io/qwik'
import { featureFlags } from '../../config/feature-flags'
import { thirdPartyScripts } from '../../config/third-party'

const idleLoader = (id: string, src: string) =>
  `(()=>{const url='${src}';let loaded=false;const load=()=>{if(loaded||!url)return;loaded=true;const s=document.createElement('script');s.src=url;s.async=true;s.dataset.thirdParty='${id}';document.body.appendChild(s);};const prime=()=>{load();cleanup();};const cleanup=()=>events.forEach((event)=>window.removeEventListener(event,prime,opts));const events=['pointerdown','keydown','touchstart','focusin'];const opts={once:true,passive:true};events.forEach((event)=>window.addEventListener(event,prime,opts));if('requestIdleCallback'in window){requestIdleCallback(()=>prime(),{timeout:5000});}else{setTimeout(prime,5000);}setTimeout(load,8000);})();`

export const ThirdPartyScripts = component$(() => {
  const partytownEnabled = featureFlags.partytown
  const entries = thirdPartyScripts
  const forwards = partytownEnabled
    ? Array.from(new Set(entries.flatMap((entry) => entry.forward ?? [])))
    : []

  if (!entries.length) {
    return null
  }

  return (
    <>
      {partytownEnabled && forwards.length > 0 && <Partytown forward={forwards} lib="/~partytown/" />}
      {entries.map((entry) => {
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

        if (entry.load === 'interaction' && entry.src) {
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
