import { expect, request, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

const profileStorageKey = 'prometheus.profile.local'
const profileUpdatedEvent = 'prometheus:profile-updated'

type TestUser = {
  name: string
  email: string
  password: string
  api: APIRequestContext
}

const buildAvatar = (label: string, color: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <rect width="64" height="64" rx="18" fill="${color}"/>
      <text x="32" y="38" text-anchor="middle" font-size="24" fill="#10151f" font-family="Arial, sans-serif">${label}</text>
    </svg>`
  ).toString('base64')}`

const buildProfile = (label: string, avatarColor: string, color: { r: number; g: number; b: number }) => ({
  bio: `Bio ${label} ${Date.now()}`,
  avatar: buildAvatar(label, avatarColor),
  color,
  updatedAt: new Date().toISOString()
})

const createUser = async (api: APIRequestContext, label: string): Promise<TestUser> => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const user: TestUser = {
    name: `Playwright ${label}`,
    email: `pw-${label}-${stamp}@example.com`,
    password: `Pw-${stamp}!`,
    api
  }
  const response = await api.post('/api/auth/sign-up/email', {
    data: {
      name: user.name,
      email: user.email,
      password: user.password,
      rememberMe: true
    }
  })
  expect(response.ok()).toBeTruthy()
  return user
}

const ensureInviteAccepted = async (inviter: TestUser, invitee: TestUser) => {
  const inviteResponse = await inviter.api.post('/api/chat/contacts/invites', {
    data: { email: invitee.email }
  })
  expect([200, 409]).toContain(inviteResponse.status())

  let inviteId: string | null = null
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const invites = await invitee.api.get('/api/chat/contacts/invites')
    if (!invites.ok()) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      continue
    }
    const payload = (await invites.json()) as { incoming?: Array<{ id: string; user: { id: string } }> }
    const incoming = payload.incoming ?? []
    const invite = incoming.find((entry) => entry.user?.id)
    if (invite?.id) {
      inviteId = invite.id
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  expect(inviteId).toBeTruthy()
  const acceptResponse = await invitee.api.post(`/api/chat/contacts/invites/${inviteId}/accept`)
  expect(acceptResponse.ok()).toBeTruthy()
}

const attachPageDebug = (page: Page, label: string) => {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      console.log(`[${label}] console:${type}`, msg.text())
    }
  })
  page.on('pageerror', (error) => {
    console.log(`[${label}] pageerror`, error.message)
  })
}

const gotoChat = async (page: Page) => {
  await page.goto('/chat', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.chat-invites-results')).toBeVisible()
}

const waitForContact = async (page: Page, email: string) => {
  const contact = page.locator('.chat-invites-item', { hasText: email })
  try {
    await expect(contact).toBeVisible({ timeout: 10_000 })
    return contact
  } catch {
    // Fall back to search if the contacts list has not populated yet.
  }

  await page.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>('.chat-invites-search input')
    if (!input) return
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, email)
  await page.locator('.chat-invites-search button[type="submit"]').click()
  await expect(contact).toBeVisible({ timeout: 20_000 })
  return contact
}

const ensureOnlinePresence = async (contact: ReturnType<Page['locator']>) => {
  const presence = contact.locator('.chat-invites-presence')
  await expect
    .poll(async () => presence.getAttribute('data-online'), { timeout: 30_000 })
    .toBe('true')
}

const openDm = async (page: Page, email: string) => {
  const contact = await waitForContact(page, email)
  await contact.locator('.chat-invites-item-name').click()
  await expect(page.locator('.chat-invites-dm')).toBeVisible({ timeout: 20_000 })
  return contact
}

const waitForConnected = async (page: Page) => {
  await expect(page.locator('.chat-invites-dm-status')).toContainText('Connected', { timeout: 45_000 })
}

const ensureChatSettings = async (page: Page) => {
  const gear = page.locator('.chat-invites-dm-gear')
  await gear.click()
  const toggles = page.locator('.chat-settings-toggle')
  const count = await toggles.count()
  for (let i = 0; i < count; i += 1) {
    const toggle = toggles.nth(i)
    const checked = await toggle.getAttribute('aria-checked')
    if (checked !== 'true') {
      await toggle.click()
    }
  }
  await gear.click()
}

const setProfile = async (page: Page, profile: Record<string, unknown>) => {
  await page.evaluate(
    ({ profile, storageKey, eventName }) => {
      localStorage.setItem(storageKey, JSON.stringify(profile))
      window.dispatchEvent(new CustomEvent(eventName, { detail: { profile } }))
    },
    { profile, storageKey: profileStorageKey, eventName: profileUpdatedEvent }
  )
}

test.describe('p2p chat e2e', () => {
  test.setTimeout(240_000)

  test('connects, shows presence, receipts, typing, and profile cards', async ({ browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL as string | undefined) ?? 'http://127.0.0.1:4173'
    const ignoreHTTPSErrors = baseURL.startsWith('https://')
    const apiA = await request.newContext({ baseURL, ignoreHTTPSErrors })
    const apiB = await request.newContext({ baseURL, ignoreHTTPSErrors })
    const sessionCheck = await apiA.get('/api/auth/session')
    if (![200, 401].includes(sessionCheck.status())) {
      throw new Error('API is not reachable. Start the API + Valkey/Postgres services before running this test.')
    }

    const [userA, userB] = await Promise.all([createUser(apiA, 'A'), createUser(apiB, 'B')])
    await ensureInviteAccepted(userA, userB)

    const contextA = await browser.newContext({ storageState: await apiA.storageState(), baseURL, ignoreHTTPSErrors })
    const contextB = await browser.newContext({ storageState: await apiB.storageState(), baseURL, ignoreHTTPSErrors })

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    attachPageDebug(pageA, 'userA')
    attachPageDebug(pageB, 'userB')

    await Promise.all([gotoChat(pageA), gotoChat(pageB)])

    const contactA = await waitForContact(pageA, userB.email)
    const contactB = await waitForContact(pageB, userA.email)
    await Promise.all([ensureOnlinePresence(contactA), ensureOnlinePresence(contactB)])

    const profileA = buildProfile('PA', '#5ad8ff', { r: 90, g: 216, b: 255 })
    const profileB = buildProfile('PB', '#ffd166', { r: 255, g: 209, b: 102 })
    await Promise.all([setProfile(pageA, profileA), setProfile(pageB, profileB)])

    await Promise.all([openDm(pageA, userB.email), openDm(pageB, userA.email)])
    await Promise.all([waitForConnected(pageA), waitForConnected(pageB)])
    await Promise.all([ensureChatSettings(pageA), ensureChatSettings(pageB)])

    const headerPresenceA = pageA.locator('.chat-invites-dm-header .chat-invites-presence')
    await expect(headerPresenceA).toHaveAttribute('data-online', 'true', { timeout: 20_000 })

    const typingTarget = pageB.locator('.chat-invites-dm-input')
    await typingTarget.click()
    await typingTarget.type('Typing now', { delay: 20 })
    await expect(pageA.locator('.chat-invites-dm-typing')).toBeVisible({ timeout: 15_000 })

    const messageText = `Hello ${Date.now()}`
    await pageA.fill('.chat-invites-dm-input', messageText)
    await pageA.press('.chat-invites-dm-input', 'Enter')

    await expect(
      pageB.locator('.chat-invites-dm-row[data-author="contact"]', { hasText: messageText })
    ).toBeVisible({ timeout: 20_000 })

    const lastState = pageA.locator('.chat-invites-dm-row[data-author="self"] .chat-invites-dm-state').last()
    await expect(lastState).toHaveText(/Read/i, { timeout: 30_000 })

    const avatarA = contactA.locator('img')
    await expect(avatarA).toHaveAttribute('src', /data:image\/svg\+xml/)

    await pageA.locator('.chat-invites-dm-header .chat-invites-avatar').click()
    await expect(pageA.locator('.profile-preview-bio')).toContainText(profileB.bio as string, { timeout: 20_000 })
    await expect(pageA.locator('.profile-avatar img')).toHaveAttribute('src', /data:image\/svg\+xml/)

    await contextA.close()
    await contextB.close()
    await apiA.dispose()
    await apiB.dispose()
  })
})
