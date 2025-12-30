import { component$ } from '@builder.io/qwik'
import { Form, type ActionStore } from '@builder.io/qwik-city'
import { _ } from '../../i18n/translate'

type OAuthProvider = {
  id: string
  label: string
}

type OAuthButtonsProps = {
  action: ActionStore<any, any>
  callback: string
  providers: OAuthProvider[]
}

export const OAuthButtons = component$<OAuthButtonsProps>(({ action, callback, providers }) => {
  if (!providers.length) return null

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
      <p class="text-sm font-semibold text-slate-50">{_`Or continue with`}</p>
      {action.value?.message ? <p class="text-sm text-rose-300">{action.value.message}</p> : null}
      <div class="grid gap-2">
        {providers.map((provider) => (
          <Form action={action} reloadDocument key={provider.id} class="flex">
            <input type="hidden" name="provider" value={provider.id} />
            <input type="hidden" name="callback" value={callback} />
            <button
              type="submit"
              class="flex-1 inline-flex items-center justify-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {_`Continue with ${provider.label}`}
            </button>
          </Form>
        ))}
      </div>
    </div>
  )
})
