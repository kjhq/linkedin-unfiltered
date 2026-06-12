# Privacy Policy

LinkedIn Unfiltered does not collect, store, or transmit any personal data to the developer.

## What the extension stores locally

- **API keys** — saved in `chrome.storage.local` on your device. These are only sent to the AI provider you explicitly configure (e.g., Mistral, OpenAI). They never leave your device for any other purpose.
- **Settings** — your personality preference, auto-translate toggle, dwell time, and "show useful takeaways" preference. Stored locally, never transmitted.

## What leaves your device

- **Post text** — when you click "Unfilter" (or auto-translate triggers), the text of the LinkedIn post you selected is sent to the AI provider you configured. This is the core function of the extension.
- **Translation counter** — when you translate a post, a +1 is sent to a global counter at `api.linkedin-unfiltered.com/count` (or the configured endpoint). No post text or identifying data is sent — only an anonymous increment. This is opt-out: you can disable it in the extension popup at any time.
- **Model registry fetch** — on first use, the extension fetches a list of available AI models from `https://models.dev/api.json` to populate the provider dropdown. No personal data is included in this request.

## What is never collected

- No telemetry, analytics, or usage stats
- No cookies
- No browsing history
- No LinkedIn profile data
- No personally identifying information
- Nothing logged, nothing tracked, nothing sold

## Third parties

The extension itself uses no third-party libraries or frameworks. The only external services involved are:

1. **Your configured AI provider** — you choose which provider receives post text. This is required for the extension to function.
2. **models.dev** — a public model registry endpoint. No personal data sent.

## Changes

If this policy changes, the version will be updated here and in the extension's listing.

---

*Last updated: June 2026*
