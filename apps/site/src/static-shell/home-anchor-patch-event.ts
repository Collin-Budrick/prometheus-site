export const HOME_FIRST_ANCHOR_PATCH_EVENT = 'prom:home:first-anchor-patch'

type AnchorPatchEventDocument = Pick<Document, 'dispatchEvent'> | null
type AnchorPatchEventCtor = new (type: string) => Event

export const dispatchHomeFirstAnchorPatchEvent = ({
  doc = typeof document !== 'undefined' ? document : null,
  EventImpl = typeof Event !== 'undefined' ? Event : null
}: {
  doc?: AnchorPatchEventDocument
  EventImpl?: AnchorPatchEventCtor | null
} = {}) => {
  if (!doc || typeof doc.dispatchEvent !== 'function' || !EventImpl) {
    return false
  }

  return doc.dispatchEvent(new EventImpl(HOME_FIRST_ANCHOR_PATCH_EVENT))
}
