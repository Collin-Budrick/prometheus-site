import { component$ } from '@builder.io/qwik'

type HomeHeroProps = {
  meta?: string
  title?: string
  subtitle?: string
  detail?: string
}

export const HomeHero = component$(({ meta, title, subtitle, detail }: HomeHeroProps) => (
  <section>
    {meta ? <div class="meta-line">{meta}</div> : null}
    {title ? <h1>{title}</h1> : null}
    {subtitle ? <p>{subtitle}</p> : null}
    {detail ? <p class="meta-line">{detail}</p> : null}
  </section>
))
