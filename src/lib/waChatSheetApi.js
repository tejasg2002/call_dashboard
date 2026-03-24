export async function fetchWaChatSheet() {
  const res = await fetch('/api/wa-chat-sheet', { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to load WhatsApp chat sheet')
    if (data.shareWithEmail) err.shareWithEmail = data.shareWithEmail
    throw err
  }
  return data
}
