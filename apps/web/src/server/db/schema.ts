import { storeItems } from '../../../../api/src/db/schema'

export type StoreItemRow = typeof storeItems.$inferSelect
export { storeItems }
