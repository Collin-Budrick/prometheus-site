export const HOME_STATIC_ENTRY_REACTIVATE_EVENT = 'prom:static-home-entry-reactivate'

type DispatchHomeStaticEntryReactivateEventOptions = {
  doc?: Pick<Document, 'dispatchEvent'> | null
  EventImpl?: typeof CustomEvent | null
}

export const dispatchHomeStaticEntryReactivateEvent = ({
  doc = typeof document !== 'undefined' ? document : null,
  EventImpl = typeof CustomEvent !== 'undefined' ? CustomEvent : null
}: DispatchHomeStaticEntryReactivateEventOptions = {}) => {
  if (!doc || typeof EventImpl !== 'function') {
    return false
  }

  return doc.dispatchEvent(
    new EventImpl(HOME_STATIC_ENTRY_REACTIVATE_EVENT, {
      bubbles: false,
      cancelable: false,
    })
  )
}
