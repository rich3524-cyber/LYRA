export async function subscribeEmail(_email: string, _listId?: string): Promise<void> {
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY
  const listId = _listId ?? process.env.KLAVIYO_LIST_ID
  if (!apiKey || !listId) return

  const res = await fetch(`https://a.klaviyo.com/api/lists/${listId}/relationships/profiles/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: '2024-02-15',
    },
    body: JSON.stringify({
      data: [{ type: 'profile', attributes: { email: _email } }],
    }),
  })
  if (!res.ok && res.status !== 409) {
    throw new Error(`Klaviyo error: ${res.status}`)
  }
}
