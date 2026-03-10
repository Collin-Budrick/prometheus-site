const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

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

const renderInline = (value: string): string => {
  let remaining = value
  let html = ''

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
      html += escapeHtml(remaining)
      break
    }

    if (bestMatch.index > 0) {
      html += escapeHtml(remaining.slice(0, bestMatch.index))
    }

    const [matchText, first, second] = bestMatch

    switch (bestPattern.type) {
      case 'link': {
        const safeUrl = second ? sanitizeUrl(second) : null
        html += safeUrl
          ? `<a href="${escapeHtml(safeUrl)}">${renderInline(first ?? '')}</a>`
          : escapeHtml(matchText)
        break
      }
      case 'strong':
        html += `<strong>${renderInline(first ?? '')}</strong>`
        break
      case 'code':
        html += `<code>${escapeHtml(first ?? '')}</code>`
        break
      case 'em':
        html += `<em>${renderInline(first ?? '')}</em>`
        break
      default:
        html += escapeHtml(matchText)
    }

    remaining = remaining.slice(bestMatch.index + matchText.length)
  }

  return html
}

const headingMatch = (line: string) => /^(#{1,4})\s+(.*)/.exec(line.trim())
const unorderedMatch = (line: string) => /^\s*[-*]\s+(.+)/.exec(line)
const orderedMatch = (line: string) => /^\s*\d+\.\s+(.+)/.exec(line)

export const renderMarkdownToHtml = (source: string) => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  let index = 0

  const isFence = (line: string) => line.trim().startsWith('```')

  const isBlockStart = (line: string) =>
    line.trim().length === 0 ||
    isFence(line) ||
    Boolean(headingMatch(line)) ||
    Boolean(unorderedMatch(line)) ||
    Boolean(orderedMatch(line))

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim().length === 0) {
      index += 1
      continue
    }

    if (isFence(line)) {
      const language = escapeHtml(line.trim().slice(3).trim())
      index += 1
      const codeLines: string[] = []
      while (index < lines.length && !isFence(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length && isFence(lines[index] ?? '')) {
        index += 1
      }
      blocks.push(
        `<pre${language ? ` data-lang="${language}"` : ''}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
      )
      continue
    }

    const heading = headingMatch(line)
    if (heading) {
      const level = Math.min(4, heading[1]?.length ?? 1)
      blocks.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`)
      index += 1
      continue
    }

    const unordered = unorderedMatch(line)
    if (unordered) {
      const items: string[] = []
      while (index < lines.length) {
        const match = unorderedMatch(lines[index] ?? '')
        if (!match) break
        items.push(`<li>${renderInline(match[1] ?? '')}</li>`)
        index += 1
      }
      blocks.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    const ordered = orderedMatch(line)
    if (ordered) {
      const items: string[] = []
      while (index < lines.length) {
        const match = orderedMatch(lines[index] ?? '')
        if (!match) break
        items.push(`<li>${renderInline(match[1] ?? '')}</li>`)
        index += 1
      }
      blocks.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && !isBlockStart(lines[index] ?? '')) {
      paragraphLines.push((lines[index] ?? '').trim())
      index += 1
    }
    if (paragraphLines.length) {
      blocks.push(`<p>${renderInline(paragraphLines.join(' '))}</p>`)
    }
  }

  return blocks.join('')
}

export const renderHomeIntroMarkdownToHtml = (source: string) => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const headingLine = lines.find((line) => headingMatch(line))
  const heading = headingLine ? headingMatch(headingLine)?.[2]?.trim() ?? '' : ''
  const bullets = lines
    .map((line) => unorderedMatch(line)?.[1]?.trim() ?? '')
    .filter(Boolean)
  const lead = lines
    .map((line) => line.trim())
    .find((line) => line && !headingMatch(line) && !unorderedMatch(line) && !orderedMatch(line)) ?? ''

  if (!heading && !lead && bullets.length === 0) {
    return renderMarkdownToHtml(source)
  }

  const parts: string[] = ['<section class="home-intro-copy-block">']
  if (heading) {
    parts.push(`<h2>${renderInline(heading)}</h2>`)
  }
  if (lead) {
    parts.push(`<div class="home-intro-copy"><span class="home-intro-copy-line">${renderInline(lead)}</span></div>`)
  }
  if (bullets.length > 0) {
    parts.push(
      `<ul class="home-intro-pills">${bullets.map((item) => `<li class="home-intro-pill">${renderInline(item)}</li>`).join('')}</ul>`
    )
  }
  parts.push('</section>')
  return parts.join('')
}
