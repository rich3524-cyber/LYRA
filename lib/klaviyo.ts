const KLAVIYO_API_KEY = process.env.KLAVIYO_PRIVATE_API_KEY
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID

export async function subscribeEmail(email: string): Promise<void> {
  if (!KLAVIYO_API_KEY || !KLAVIYO_LIST_ID) {
    console.error('[klaviyo] env vars not set — skipping subscribe')
    return
  }

  const res = await fetch('https://a.klaviyo.com/api/profile-subscriptions-bulk-create-jobs/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [
              {
                type: 'profile',
                attributes: {
                  email,
                  subscriptions: {
                    email: { marketing: { consent: 'SUBSCRIBED' } },
                  },
                },
              },
            ],
          },
        },
        relationships: {
          list: { data: { type: 'list', id: KLAVIYO_LIST_ID } },
        },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[klaviyo] subscribe failed', res.status, body)
    throw new Error(`Klaviyo subscribe failed: ${res.status}`)
  }
}
