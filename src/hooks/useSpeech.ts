import { useRef, useState } from 'react'

// Browser speech-to-text (Web Speech API). Works in Chrome-family browsers
// with mic permission; callers should fall back gracefully when unsupported.
export function useSpeech(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<{ stop: () => void } | null>(null)
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  const supported = !!(w.SpeechRecognition || w.webkitSpeechRecognition)

  function start(): boolean {
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => {
      lang: string; interimResults: boolean; maxAlternatives: number
      onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void
      onend: () => void; onerror: (e: unknown) => void
      start: () => void; stop: () => void
    }) | undefined
    if (!SR) return false
    try {
      const rec = new SR()
      rec.lang = 'en-GB'
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.onresult = e => onResult(e.results[0][0].transcript)
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      recRef.current = rec
      rec.start()
      setListening(true)
      return true
    } catch {
      setListening(false)
      return false
    }
  }
  function stop() {
    recRef.current?.stop()
    setListening(false)
  }
  return { supported, listening, start, stop }
}
