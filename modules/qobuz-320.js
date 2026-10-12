/*
 * BitChord module – Qobuz 320kbps MP3 (v1.0.0)
 *
 * Qobuz catalogue search with streams pinned to 320kbps MP3 (format_id 5).
 * This is the reliability play, not the quality play: 320kbps MP3 costs a
 * fraction of a FLAC to fetch and decode, while Qobuz catalogue IDs plus true
 * durations let BitChord's matcher land on the right recording instead of a
 * same-name cut — the failure JioSaavn-style text matching keeps producing.
 *
 * Bring your own credentials. There is no credentialless Qobuz: file URLs are
 * minted per request with an app secret signature plus a user token, and
 * neither can ship in a public file (nor be asked of a stranger's proxy
 * without becoming its load). Four settings, all read from the module
 * context, all user-supplied:
 *   - qobuzApiBase       (default "https://www.qobuz.com/api.json/0.2")
 *   - qobuzAppId         (application ID)
 *   - qobuzSecret        (used only to sign file-URL requests)
 *   - qobuzUserAuthToken (a paying account token)
 * Without app ID, secret and token the module answers nothing. That is
 * deliberate: a search that cannot stream is a row that wastes a lookup.
 *
 * Rows are labeled HIGH / mp3 on purpose. Claiming LOSSLESS for a 320kbps
 * file would outrank real FLAC in the resolver and "upgrade" tracks
 * downward. Honest tiers keep the ordering truthful.
 *
 * Tested against BitChord V1.5.2 module contract:
 *   module.exports.searchTracks(query, limit, context) → { tracks, total }
 *   module.exports.getTrackStreamUrl(id, quality, context) → { streamUrl, track }
 */
(function () {

  /* ── Settings helpers ──────────────────────────────────────────────── */

  /**
   * BitChord sends `context.settings` as `{ key: { value: "..." } }`, and a
   * bare string is accepted too so a hand-edited settings blob still works.
   */
  function setting(context, key) {
    if (!context || !context.settings) return '';
    var entry = context.settings[key];
    if (entry == null) return '';
    if (typeof entry === 'object' && entry.value != null) return String(entry.value);
    if (typeof entry === 'string') return entry;
    return '';
  }

  function apiBase(context) {
    return setting(context, 'qobuzApiBase') || 'https://www.qobuz.com/api.json/0.2';
  }

  /**
   * All three secrets present. The base URL has a sane default; the rest do
   * not, and must not — defaults here would be somebody's credentials.
   */
  function configured(context) {
    return !!(
      setting(context, 'qobuzAppId') &&
      setting(context, 'qobuzSecret') &&
      setting(context, 'qobuzUserAuthToken')
    );
  }

  /* ── Quality ───────────────────────────────────────────────────────── */

  /** Qobuz format_id for 320kbps MP3. Pinned: this module serves nothing else. */
  var FORMAT_ID_320 = '5';

  /* ── MD5 (RFC 1321, compact) ───────────────────────────────────────── */

  /**
   * Embedded because the sandbox offers no crypto module, and the file-URL
   * signature needs exactly one hash. Verified against the standard vectors
   * ("", "abc", "The quick brown fox jumps over the lazy dog") in the
   * Node harness before shipping.
   */
  function md5(message) {
    function add(a, b) {
      var low = (a & 0xffff) + (b & 0xffff);
      var high = (a >>> 16) + (b >>> 16) + (low >>> 16);
      return ((high << 16) | (low & 0xffff)) >>> 0;
    }
    function rol(n, s) {
      return ((n << s) | (n >>> (32 - s))) >>> 0;
    }

    var bytes = [];
    var i;
    for (i = 0; i < message.length; i++) {
      var code = message.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else if (code < 2048) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        i++;
        var lo = message.charCodeAt(i);
        var cp = 0x10000 + ((code & 0x3ff) << 10) + (lo & 0x3ff);
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
    }
    var bitLenHi = Math.floor(bytes.length / 0x20000000);
    var bitLenLo = (bytes.length << 3) >>> 0;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 0; i < 4; i++) bytes.push((bitLenLo >>> (i * 8)) & 0xff);
    for (i = 0; i < 4; i++) bytes.push((bitLenHi >>> (i * 8)) & 0xff);

    var shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    var K = [];
    for (i = 0; i < 64; i++) {
      K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    }

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

    for (var off = 0; off < bytes.length; off += 64) {
      var M = [];
      for (var j = 0; j < 16; j++) {
        M[j] = (bytes[off + j * 4] | (bytes[off + j * 4 + 1] << 8) |
          (bytes[off + j * 4 + 2] << 16) | (bytes[off + j * 4 + 3] << 24)) >>> 0;
      }
      var A = a0, B = b0, C = c0, D = d0;
      for (var k = 0; k < 64; k++) {
        var F, g;
        var round = k >> 4;
        if (round === 0) { F = (B & C) | (~B & D); g = k; }
        else if (round === 1) { F = (D & B) | (~D & C); g = (5 * k + 1) % 16; }
        else if (round === 2) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * k) % 16; }
        F = add(add(add(F, A), K[k]), M[g]);
        A = D;
        D = C;
        C = B;
        B = add(B, rol(F, shifts[round * 4 + (k % 4)]));
      }
      a0 = add(a0, A);
      b0 = add(b0, B);
      c0 = add(c0, C);
      d0 = add(d0, D);
    }

    function wordToHex(word) {
      var out = '';
      for (var b = 0; b < 4; b++) {
        var byte = (word >>> (b * 8)) & 0xff;
        out += ((byte < 16) ? '0' : '') + byte.toString(16);
      }
      return out;
    }
    return wordToHex(a0) + wordToHex(b0) + wordToHex(c0) + wordToHex(d0);
  }

  /**
   * The file-URL request signature, exactly as Qobuz expects it:
   * MD5("trackgetFileUrl" + "format_id" + fid + "intentstream" +
   *     "track_id" + id + ts + secret).
   */
  function requestSig(trackId, formatId, ts, secret) {
    return md5('trackgetFileUrlformat_id' + formatId + 'intentstreamtrack_id' +
      trackId + ts + secret);
  }

  /* ── HTTP ──────────────────────────────────────────────────────────── */

  /**
   * Reads a response body that may be a value or a promise.
   *
   * BitChord's bridge defines `text()` and `json()` as synchronous — they
   * return the body, not a promise for it — while spec fetch returns
   * promises. Branching on `.then` works under both shapes, so the same file
   * runs on-device and in the Node harness.
   */
  function bodyOf(resp, asJson) {
    var value = asJson ? resp.json() : resp.text();
    if (value && typeof value.then === 'function') return value;
    return Promise.resolve(asJson && typeof value === 'string' ? JSON.parse(value) : value);
  }

  function getJson(url, context, timeoutMs) {
    var settled = false;
    var guard = new Promise(function (_, reject) {
      setTimeout(function () {
        if (!settled) reject(new Error('timeout after ' + timeoutMs + 'ms'));
      }, timeoutMs);
    });
    var call = fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-App-Id': setting(context, 'qobuzAppId'),
        'X-User-Auth-Token': setting(context, 'qobuzUserAuthToken')
      }
    }).then(function (resp) {
      settled = true;
      if (!resp.ok) throw new Error('Qobuz HTTP ' + resp.status);
      return bodyOf(resp, true);
    }, function (error) {
      settled = true;
      throw error;
    });
    return Promise.race([call, guard]);
  }

  /* ── searchTracks ──────────────────────────────────────────────────── */

  module.exports.searchTracks = async function (query, limit, context) {
    if (!configured(context)) {
      return { tracks: [], total: 0 };
    }
    if (!query || !String(query).trim()) {
      return { tracks: [], total: 0 };
    }

    var url = apiBase(context) + '/catalog/search?query=' +
      encodeURIComponent(query) + '&limit=' + (limit || 25) + '&offset=0';

    var root;
    try {
      root = await getJson(url, context, 8000);
    } catch (e) {
      return { tracks: [], total: 0 };
    }

    var items = (root.tracks && root.tracks.items) ? root.tracks.items : [];

    var tracks = items.map(function (item) {
      var artist = 'Unknown Artist';
      if (item.performer && item.performer.name) {
        artist = item.performer.name;
      } else if (item.artist && item.artist.name) {
        artist = item.artist.name;
      }

      var albumTitle = '';
      var albumCover = null;
      if (item.album) {
        albumTitle = item.album.title || '';
        if (item.album.image) {
          albumCover = item.album.image.large ||
            item.album.image.small ||
            item.album.image.thumbnail || null;
        }
      }

      return {
        id: String(item.id),
        title: item.title || 'Unknown',
        artist: artist,
        album: albumTitle,
        albumCover: albumCover,
        duration: item.duration || 0,
        trackNumber: item.track_number || 0,
        audioQuality: 'HIGH',
        format: 'mp3',
        availableQualities: ['HIGH']
      };
    });

    return { tracks: tracks, total: tracks.length };
  };

  /* ── getTrackStreamUrl ─────────────────────────────────────────────── */

  module.exports.getTrackStreamUrl = async function (id, quality, context) {
    var unusable = {
      streamUrl: null,
      track: { id: String(id), audioQuality: 'HIGH' }
    };
    if (!configured(context)) {
      return unusable;
    }

    // Pinned to 320kbps whatever was asked: it is the ceiling this module
    // serves, and answering a LOSSLESS request with it under a HIGH label
    // lets the resolver rank it below real FLAC instead of above it.
    var ts = Math.floor(Date.now() / 1000);
    var sig = requestSig(
      String(id), FORMAT_ID_320, ts, setting(context, 'qobuzSecret'));

    var url = apiBase(context) + '/track/getFileUrl?track_id=' +
      encodeURIComponent(String(id)) + '&format_id=' + FORMAT_ID_320 +
      '&intent=stream&request_ts=' + ts + '&request_sig=' + sig;

    var root;
    try {
      root = await getJson(url, context, 10000);
    } catch (e) {
      return unusable;
    }

    return {
      streamUrl: root.url || null,
      track: {
        id: String(id),
        audioQuality: 'HIGH',
        mimeType: root.mime_type || 'audio/mpeg',
        bitDepth: root.bit_depth || null,
        sampleRate: root.sampling_rate || null,
        bitrate: root.bitrate || 320
      }
    };
  };

}());
