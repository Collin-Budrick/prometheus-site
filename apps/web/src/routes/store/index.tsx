import StorePage from '../[locale]/store/index'
import { LocaleEntry, usePreferredLocale } from '../_shared/locale/entry'

export {
  head,
  onGet,
  useCreateStoreItem,
  useDeleteStoreItem,
  useStoreItemsLoader,
  useUpdateStoreItem
} from '../[locale]/store/index'
export { usePreferredLocale }

export default LocaleEntry(StorePage)
