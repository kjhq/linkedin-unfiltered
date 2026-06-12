# Counter API

Cloudflare Worker for the LinkedIn Unfiltered global translation counter.

## Deploy

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/):
   ```
   npm install -g wrangler
   ```

2. Log in:
   ```
   wrangler login
   ```

3. Create a KV namespace:
   ```
   wrangler kv:namespace create COUNTER
   ```

4. Copy the KV namespace ID into `wrangler.toml`.

5. Update `COUNTER_API` in `background.js` to your worker URL.

6. Deploy:
   ```
   wrangler deploy
   ```

## Notes

- The worker path must be configured in `background.js` as `COUNTER_API`.
- Requires a `COUNTER` KV namespace in Cloudflare.
- No authentication — the counter is anonymous by design.
