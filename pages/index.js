import { useState } from 'react';

function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (
    (parseInt(h || '0', 10) * 3600) +
    (parseInt(m || '0', 10) * 60) +
    parseInt(s || '0', 10)
  );
}

function formatDuration(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export default function Home() {
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [channel, setChannel] = useState('');
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [limit, setLimit] = useState(0);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('views');
  const [minLikes, setMinLikes] = useState(0);
  const [maxLikes, setMaxLikes] = useState(0);
  const [minLikeRatio, setMinLikeRatio] = useState(0);
  const [minDuration, setMinDuration] = useState(0);
  const [maxDuration, setMaxDuration] = useState(0);
  const [likesMaxBound, setLikesMaxBound] = useState(0);
  const [durationMaxBound, setDurationMaxBound] = useState(0);
  const [pendingMinLikeRatio, setPendingMinLikeRatio] = useState(0);
  const [pendingMinLikes, setPendingMinLikes] = useState(0);
  const [pendingMaxLikes, setPendingMaxLikes] = useState(0);
  const [pendingMinDuration, setPendingMinDuration] = useState(0);
  const [pendingMaxDuration, setPendingMaxDuration] = useState(0);

  const fetchVideos = async () => {
    setLoading(true);
    setError('');
    setVideos([]);
    try {
      const params = new URLSearchParams({
        channel,
        start,
        end,
        limit: String(limit),
      });
      const res = await fetch(`/api/videos?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Request failed');
      }
      const data = await res.json();
      const processed = (data.videos || []).map((v) => {
        const likes = Number(v.Likes || 0);
        const views = Number(v.Views || 0);
        const likeRatio = views ? likes / views : 0;
        const durationSeconds = parseDuration(v.Duration || '');
        return { ...v, Likes: likes, LikeRatio: likeRatio, DurationSeconds: durationSeconds };
      });
      const maxLikesVal = Math.max(0, ...processed.map((v) => v.Likes));
      const maxDurationVal = Math.max(0, ...processed.map((v) => v.DurationSeconds));
      setLikesMaxBound(maxLikesVal);
      setDurationMaxBound(maxDurationVal);
      setMinLikes(0);
      setMaxLikes(maxLikesVal);
      setMinDuration(0);
      setMaxDuration(maxDurationVal);
      setMinLikeRatio(0);
      setPendingMinLikes(0);
      setPendingMaxLikes(maxLikesVal);
      setPendingMinDuration(0);
      setPendingMaxDuration(maxDurationVal);
      setPendingMinLikeRatio(0);
      setSortBy('views');
      setVideos(processed);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const displayedVideos = videos
    .filter((v) => v.LikeRatio >= minLikeRatio)
    .filter((v) => v.Likes >= minLikes)
    .filter((v) => v.Likes <= maxLikes)
    .filter((v) => v.DurationSeconds >= minDuration)
    .filter((v) => v.DurationSeconds <= maxDuration)
    .sort((a, b) => {
      if (sortBy === 'likeRatio') return b.LikeRatio - a.LikeRatio;
      if (sortBy === 'duration') return b.DurationSeconds - a.DurationSeconds;
      return b.Views - a.Views;
    });

  const downloadCsv = () => {
    if (!displayedVideos.length) return;
    const headers = ['Title', 'Views', 'Likes', 'LikeRatio', 'Published', 'Duration', 'Video URL'];
    const lines = displayedVideos.map((v) =>
      headers
        .map((h) => `${String(v[h] || '').replace(/"/g, '""')}`)
        .map((s) => `"${s}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'channel_videos_sorted.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const applyFilters = () => {
    setMinLikeRatio(pendingMinLikeRatio);
    setMinLikes(pendingMinLikes);
    setMaxLikes(pendingMaxLikes);
    setMinDuration(pendingMinDuration);
    setMaxDuration(pendingMaxDuration);
  };

  return (
    <div className="container">
      <h1>YouTube channel video sorter</h1>
      <p>Sort a channel's uploads by view count within a date range.</p>
      <div style={{ marginBottom: '1rem' }}>
        <label>
          Channel handle or URL
          <input
            type="text"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="@LinusTechTips or https://www.youtube.com/@LinusTechTips"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <label style={{ flex: 1 }}>
          Start date
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </label>
        <label style={{ flex: 1 }}>
          End date
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </label>
        <label style={{ flex: 1 }}>
          Max videos (0 for all)
          <input
            type="number"
            min="0"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </label>
      </div>
      <button onClick={fetchVideos} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch and sort'}
      </button>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
      {displayedVideos.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p>
            Found {displayedVideos.length} videos between {start} and {end}.
          </p>
          <button onClick={downloadCsv} style={{ marginBottom: '1rem' }}>
            Download CSV
          </button>
          <div style={{ marginBottom: '1rem' }}>
            <label>
              Sort by:{' '}
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="views">Views</option>
                <option value="likeRatio">Like ratio</option>
                <option value="duration">Duration</option>
              </select>
            </label>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Min like ratio: {Math.round(pendingMinLikeRatio * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={pendingMinLikeRatio}
              onChange={(e) => setPendingMinLikeRatio(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ flex: 1 }}>
              Min likes: {pendingMinLikes}
              <input
                type="range"
                min="0"
                max={likesMaxBound}
                value={pendingMinLikes}
                onChange={(e) => setPendingMinLikes(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Max likes: {pendingMaxLikes}
              <input
                type="range"
                min="0"
                max={likesMaxBound}
                value={pendingMaxLikes}
                onChange={(e) => setPendingMaxLikes(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ flex: 1 }}>
              Min duration: {formatDuration(pendingMinDuration)}
              <input
                type="range"
                min="0"
                max={durationMaxBound}
                value={pendingMinDuration}
                onChange={(e) => setPendingMinDuration(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Max duration: {formatDuration(pendingMaxDuration)}
              <input
                type="range"
                min="0"
                max={durationMaxBound}
                value={pendingMaxDuration}
                onChange={(e) => setPendingMaxDuration(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <button onClick={applyFilters}>Apply filters</button>
          </div>
          {displayedVideos.map((v) => (
            <div key={v['Video URL']} className="video-card">
              {v.Thumb && (
                <img
                  src={v.Thumb}
                  alt="thumbnail"
                  style={{ width: '120px', height: '90px', objectFit: 'cover' }}
                />
              )}
              <div>
                <a href={v['Video URL']} target="_blank" rel="noopener noreferrer">
                  <strong>{v.Title}</strong>
                </a>
                <div>Views: {v.Views.toLocaleString()}</div>
                <div>Likes: {v.Likes.toLocaleString()}</div>
                <div>
                  Like Ratio: {(v.LikeRatio * 100).toFixed(1)}%
                </div>
                <div>Published: {new Date(v.Published).toISOString().slice(0, 10)}</div>
                <div>Duration: {formatDuration(v.DurationSeconds)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

