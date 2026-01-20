import { component$, type JSX } from '@builder.io/qwik'
import { FragmentCard, type FragmentCardProps } from './FragmentCard'

type MarkdownNode = JSX.Element | string

type FragmentMarkdownBlockProps = Omit<FragmentCardProps, 'children' | 'size' | 'variant' | 'draggable'> & {
  markdown: string
  size?: FragmentCardProps['size']
}

const sanitizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed
  try {
    const parsed = new URL(trimmed, 'https://example.com')
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    ) {
      return trimmed
    }
  } catch {
    return null
  }
  return null
}

const inlinePatterns: Array<{
  type: 'link' | 'strong' | 'code' | 'em'
  regex: RegExp
}> = [
  { type: 'link', regex: /\[([^\]]+)\]\(([^)]+)\)/ },
  { type: 'strong', regex: /\*\*([^*]+)\*\*/ },
  { type: 'code', regex: /`([^`]+)`/ },
  { type: 'em', regex: /\*([^*]+)\*/ }
]

const renderInline = (value: string): MarkdownNode[] => {
  const nodes: MarkdownNode[] = []
  let remaining = value

  while (remaining.length > 0) {
    let bestMatch: RegExpExecArray | null = null
    let bestPattern: (typeof inlinePatterns)[number] | null = null

    for (const pattern of inlinePatterns) {
      const match = pattern.regex.exec(remaining)
      if (!match) continue
      if (!bestMatch) {
        bestMatch = match
        bestPattern = pattern
        continue
      }
      if (
        match.index < bestMatch.index ||
        (match.index === bestMatch.index && match[0].length > bestMatch[0].length)
      ) {
        bestMatch = match
        bestPattern = pattern
      }
    }

    if (!bestMatch || !bestPattern || bestMatch.index === undefined) {
      nodes.push(remaining)
      break
    }

    if (bestMatch.index > 0) {
      nodes.push(remaining.slice(0, bestMatch.index))
    }

    const [matchText, first, second] = bestMatch
    const key = `${nodes.length}-${matchText}-${bestMatch.index}`

    switch (bestPattern.type) {
      case 'link': {
        const safeUrl = second ? sanitizeUrl(second) : null
        if (!safeUrl) {
          nodes.push(matchText)
          break
        }
        nodes.push(
          <a key={key} href={safeUrl}>
            {renderInline(first ?? '')}
          </a>
        )
        break
      }
      case 'strong':
        nodes.push(
          <strong key={key}>
            {renderInline(first ?? '')}
          </strong>
        )
        break
      case 'code':
        nodes.push(<code key={key}>{first ?? ''}</code>)
        break
      case 'em':
        nodes.push(
          <em key={key}>
            {renderInline(first ?? '')}
          </em>
        )
        break
      default:
        nodes.push(matchText)
    }

    const nextIndex = bestMatch.index + matchText.length
    remaining = remaining.slice(nextIndex)
  }

  return nodes
}

const renderMarkdown = (source: string): MarkdownNode[] => {
  const nodes: MarkdownNode[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let index = 0

  const isFence = (line: string) => line.trim().startsWith('```')
  const headingMatch = (line: string) => /^(#{1,4})\s+(.*)/.exec(line.trim())
  const unorderedMatch = (line: string) => /^\s*[-*]\s+(.+)/.exec(line)
  const orderedMatch = (line: string) => /^\s*\d+\.\s+(.+)/.exec(line)

  const isBlockStart = (line: string) =>
    line.trim().length === 0 || isFence(line) || Boolean(headingMatch(line)) || Boolean(unorderedMatch(line)) || Boolean(orderedMatch(line))

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim().length === 0) {
      index += 1
      continue
    }

    if (isFence(line)) {
      const language = line.trim().slice(3).trim()
      index += 1
      const codeLines: string[] = []
      while (index < lines.length && !isFence(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length && isFence(lines[index] ?? '')) {
        index += 1
      }
      nodes.push(
        <pre key={`code-${nodes.length}`} data-lang={language || undefined}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    const heading = headingMatch(line)
    if (heading) {
      const level = Math.min(4, heading[1]?.length ?? 1)
      const content = heading[2] ?? ''
      const headingNodes = renderInline(content)
      switch (level) {
        case 1:
          nodes.push(<h1 key={`heading-${nodes.length}`}>{headingNodes}</h1>)
          break
        case 2:
          nodes.push(<h2 key={`heading-${nodes.length}`}>{headingNodes}</h2>)
          break
        case 3:
          nodes.push(<h3 key={`heading-${nodes.length}`}>{headingNodes}</h3>)
          break
        default:
          nodes.push(<h4 key={`heading-${nodes.length}`}>{headingNodes}</h4>)
          break
      }
      index += 1
      continue
    }

    const unordered = unorderedMatch(line)
    if (unordered) {
      const items: string[] = []
      while (index < lines.length) {
        const match = unorderedMatch(lines[index] ?? '')
        if (!match) break
        items.push(match[1] ?? '')
        index += 1
      }
      nodes.push(
        <ul key={`ul-${nodes.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-${nodes.length}-item-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    const ordered = orderedMatch(line)
    if (ordered) {
      const items: string[] = []
      while (index < lines.length) {
        const match = orderedMatch(lines[index] ?? '')
        if (!match) break
        items.push(match[1] ?? '')
        index += 1
      }
      nodes.push(
        <ol key={`ol-${nodes.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-${nodes.length}-item-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && !isBlockStart(lines[index] ?? '')) {
      paragraphLines.push((lines[index] ?? '').trim())
      index += 1
    }
    if (paragraphLines.length) {
      const paragraph = paragraphLines.join(' ')
      nodes.push(
        <p key={`p-${nodes.length}`}>{renderInline(paragraph)}</p>
      )
    }
  }

  return nodes
}

export const FragmentMarkdownBlock = component$<FragmentMarkdownBlockProps>(
  ({ markdown, size, expandable = false, fragmentId, id, ...cardProps }) => {
    const resolvedFragmentId = fragmentId ?? id
    return (
      <FragmentCard
        {...cardProps}
        id={id}
        fragmentId={resolvedFragmentId}
        size={size ?? 'big'}
        variant="text"
        draggable={false}
        expandable={expandable}
      >
        <div class="fragment-markdown">{renderMarkdown(markdown)}</div>
      </FragmentCard>
    )
  }
)
