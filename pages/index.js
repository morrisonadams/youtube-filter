import { useState } from 'react';

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
      setVideos(data.videos || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!videos.length) return;
    const headers = ['Title', 'Views', 'Published', 'Duration', 'Video URL'];
    const lines = videos.map((v) =>
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

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
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
      <button onClick={fetchVideos} disabled={loading} style={{ padding: '0.5rem 1rem' }}>
        {loading ? 'Loading...' : 'Fetch and sort'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {videos.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p>
            Found {videos.length} videos between {start} and {end}. Sorted by view
            count descending.
          </p>
          <button onClick={downloadCsv} style={{ marginBottom: '1rem' }}>
            Download CSV
          </button>
          {videos.map((v) => (
            <div
              key={v['Video URL']}
              style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', border: '1px solid #ddd', padding: '0.5rem' }}
            >
              {v.Thumb && (
                <img src={v.Thumb} alt="thumbnail" style={{ width: '120px', height: '90px', objectFit: 'cover' }} />
              )}
              <div>
                <a href={v['Video URL']} target="_blank" rel="noopener noreferrer">
                  <strong>{v.Title}</strong>
                </a>
                <div>Views: {v.Views.toLocaleString()}</div>
                <div>Published: {new Date(v.Published).toISOString().slice(0, 10)}</div>
                {v.Duration && <div>ISO 8601 Duration: {v.Duration}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

