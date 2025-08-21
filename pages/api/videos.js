export function parseChannelIdOrHandle(text) {
  const t = text.trim();
  if (t.startsWith('http')) {
    try {
      const u = new URL(t);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0].toLowerCase() === 'channel') {
        return { channelId: parts[1] };
      }
      if (parts.length >= 1 && parts[0].startsWith('@')) {
        return { handle: parts[0].slice(1) };
      }
      if (parts.length) {
        return { handle: parts[parts.length - 1].replace(/^@/, '') };
      }
    } catch (e) {}
  }
  if (t.startsWith('@')) {
    return { handle: t.slice(1) };
  }
  if (t.startsWith('UC') && t.length >= 20) {
    return { channelId: t };
  }
  return { handle: t.replace(/^@/, '') };
}

export async function getChannelId(ref, apiKey) {
  if (ref.channelId) return ref.channelId;
  const q = ref.handle;
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(
    q
  )}&key=${apiKey}`;
  try {
    const search = await fetch(searchUrl).then((r) => r.json());
    const items = search.items || [];
    if (items.length) {
      return items[0].snippet?.channelId || items[0].id?.channelId || null;
    }
    console.warn('getChannelId: search returned no results', {
      query: q,
      response: search,
    });
    const usernameUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(
      q
    )}&key=${apiKey}`;
    const ch = await fetch(usernameUrl).then((r) => r.json());
    if (ch.items && ch.items.length) {
      return ch.items[0].id;
    }
    console.error('getChannelId: username lookup failed', {
      query: q,
      response: ch,
    });
  } catch (e) {
    console.error('getChannelId: fetch failed', { query: q, error: e });
  }
  return null;
}

export default async function handler(req, res) {
  const { channel, start, end, limit = '0' } = req.query;
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'API key not configured' });
    return;
  }
  if (!channel) {
    res.status(400).json({ error: 'Channel parameter required' });
    return;
  }

  const limitNum = parseInt(Array.isArray(limit) ? limit[0] : limit, 10) || 0;
  const startDate = start
    ? new Date(`${start}T00:00:00Z`)
    : new Date('1970-01-01T00:00:00Z');
  const endDate = end ? new Date(`${end}T23:59:59Z`) : new Date();

  async function getUploadsPlaylistId(channelId) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
    const resp = await fetch(url).then((r) => r.json());
    const items = resp.items || [];
    if (!items.length) return null;
    return items[0].contentDetails?.relatedPlaylists?.uploads || null;
  }

  async function iteratePlaylistItems(playlistId) {
    let pageToken = '';
    const out = [];
    while (true) {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${apiKey}${
        pageToken ? `&pageToken=${pageToken}` : ''
      }`;
      const resp = await fetch(url).then((r) => r.json());
      for (const item of resp.items || []) {
        out.push(item);
      }
      pageToken = resp.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }

  async function fetchVideoStats(ids) {
    const stats = {};
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50).join(',');
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${batch}&key=${apiKey}`;
      const resp = await fetch(url).then((r) => r.json());
      for (const v of resp.items || []) {
        stats[v.id] = v;
      }
    }
    return stats;
  }

  const ref = parseChannelIdOrHandle(Array.isArray(channel) ? channel[0] : channel);
  const channelId = await getChannelId(ref, apiKey);
  if (!channelId) {
    console.error('Could not resolve the channel', { input: channel, ref });
    res.status(404).json({ error: 'Could not resolve the channel.' });
    return;
  }

  const uploadsPid = await getUploadsPlaylistId(channelId);
  if (!uploadsPid) {
    res.status(404).json({ error: 'Could not find uploads playlist.' });
    return;
  }

  const items = await iteratePlaylistItems(uploadsPid);
  const collected = [];
  for (const item of items) {
    const vid = item.contentDetails?.videoId;
    const pub = new Date(item.snippet?.publishedAt);
    if (vid && pub >= startDate && pub <= endDate) {
      collected.push({ videoId: vid, publishedAt: pub });
    }
    if (limitNum && collected.length >= limitNum) break;
  }

  if (!collected.length) {
    res.status(200).json({ videos: [] });
    return;
  }

  const stats = await fetchVideoStats(collected.map((c) => c.videoId));

  const rows = collected
    .map((c) => {
      const v = stats[c.videoId];
      if (!v) return null;
      const sn = v.snippet || {};
      const st = v.statistics || {};
      const thumb =
        sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '';
      return {
        Title: sn.title || '',
        Views: Number(st.viewCount || 0),
        Published: sn.publishedAt || '',
        Duration: v.contentDetails?.duration || '',
        'Video URL': `https://www.youtube.com/watch?v=${c.videoId}`,
        Thumb: thumb,
      };
    })
    .filter(Boolean);

  rows.sort((a, b) => b.Views - a.Views);

  res.status(200).json({ videos: rows });
}
