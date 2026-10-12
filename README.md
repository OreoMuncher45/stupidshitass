# BitChord Streaming Modules

Qobuz 320kbps streaming module for [BitChord](https://github.com/kushagrasinghx/BitChord) (`v1.5.2` and newer). Bring your own credentials — there is no credentialless Qobuz.

---

## ⚠️ Important: How to Add in BitChord

When adding a custom source in **BitChord > Settings > Sources**, you **MUST** use a **raw JSON URL**.

### ✅ Working URLs (Copy one of these into BitChord):

- **Direct Raw URL (Recommended):**
  ```text
  https://raw.githubusercontent.com/OreoMuncher45/stupidshitass/main/index.json
  ```
- **Alternative (manifest.json format):**
  ```text
  https://raw.githubusercontent.com/OreoMuncher45/stupidshitass/main/manifest.json
  ```
- **CDN Mirror (jsDelivr):**
  ```text
  https://cdn.jsdelivr.net/gh/OreoMuncher45/stupidshitass@main/index.json
  ```

---

### ❌ Why `github.com` URLs cause "Unrecognised JSON — it holds meta, payload"

If you paste:
- `https://github.com/OreoMuncher45/bitchord-streaming-modules`
- `https://github.com/OreoMuncher45/bitchord-streaming-modules/blob/main/index.json`
- `https://github.com/OreoMuncher45/bitchord-streaming-modules/blob/main/manifest.json`

BitChord sends an HTTP request with `Accept: application/json`. GitHub responds with its internal web-app React SPA state instead of raw file contents:
```json
{
  "meta": { ... },
  "payload": { ... }
}
```
BitChord inspects the keys (`meta`, `payload`) and rejects it with:
> `Unrecognised JSON — it holds meta, payload` (from `SourceFormats.kt:193`)

Using `raw.githubusercontent.com` returns the actual JSON payload with `"category:music"` and manifest descriptors, allowing BitChord to correctly identify and load the modules.

---

## How BitChord Handles Playlists

BitChord does not browse external Tidal/Qobuz playlists natively. Instead, BitChord integrates streaming modules via **track substitution**:
1. When you play an album, playlist, radio station, or search result from YouTube Music, BitChord's `SourceResolver.substituteForYouTube()` checks your active sources.
2. If your custom module is ranked above YouTube (default rank 0 vs YouTube rank 3), BitChord calls `module.exports.searchTracks()` for the track's artist and title.
3. `TrackMatcher` validates whether the candidate is a genuine match.
4. BitChord calls `module.exports.getTrackStreamUrl()` to retrieve the 320kbps stream.
5. If the module returns a valid stream, BitChord plays the Qobuz 320kbps MP3; if unavailable or missing, it seamlessly falls back to YouTube Music.

---

## Included Modules

### 1. Qobuz 320kbps MP3 (`qobuz-320`)
- **Pinned quality:** every stream is Qobuz `format_id` 5 (320kbps MP3), whatever tier BitChord asks for. Rows are labeled HIGH/mp3 on purpose — claiming lossless for a 320 file would outrank real FLAC and "upgrade" tracks downward.
- **Why Qobuz for 320:** true catalogue IDs plus real durations let `TrackMatcher` land on the right recording instead of a same-name cut — the failure text-search matching keeps producing.
- **Credentials (required):** there is no credentialless Qobuz. File URLs are minted per request with an app-secret signature plus a user token, so the module is inert until you supply all three in the module settings:
  - `qobuzApiBase` (default `https://www.qobuz.com/api.json/0.2`)
  - `qobuzAppId` (application ID — see [Qobuz-AppID-Secret-Tool](https://github.com/QobuzDL/Qobuz-AppID-Secret-Tool))
  - `qobuzSecret` (used only to sign file-URL requests, never sent anywhere else)
  - `qobuzUserAuthToken` (a paying account token — `localuser.token` in localStorage on [play.qobuz.com](https://play.qobuz.com))
- **Never commit credentials to a public fork.** Settings live on the device, not in this repo (`test_contract.py` rejects hardcoded secrets).
- **Timeouts:** 8s search / 10s stream; slow hosts fail fast into BitChord's fallback instead of stalling the track.

---

## Contract Verification

Both `index.json` and `manifest.json` conform to the BitChord QuickJS and Addon specifications:

```bash
python3 test_contract.py
```
