import os
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
import streamlit as st
from googleapiclient.discovery import build

# -------- Helpers --------

def parse_channel_id_or_handle(text: str) -> Dict[str, str]:
    """Return one of: {"channelId": "..."} or {"handle": "..."} based on input."""
    t = text.strip()
    if t.startswith("http"):
        # Try to parse common URL forms
        # https://www.youtube.com/channel/UCxxxx
        # https://www.youtube.com/@handle
        # https://www.youtube.com/c/CustomName  (legacy)
        # Also accept full video/playlist urls if the user pastes them by mistake
        try:
            from urllib.parse import urlparse
            p = urlparse(t)
            parts = [p for p in p.path.split("/") if p]
            if len(parts) >= 2 and parts[0].lower() == "channel":
                return {"channelId": parts[1]}
            if len(parts) >= 1 and parts[0].startswith("@"):
                return {"handle": parts[0][1:]}
            # Legacy /c/ or other forms: fall back to handle-like search on last part
            if parts:
                return {"handle": parts[-1].lstrip("@")}
        except Exception:
            pass
    # Bare handle like @rtgame
    if t.startswith("@"):
        return {"handle": t[1:]}
    # Raw channel id
    if t.startswith("UC") and len(t) >= 20:
        return {"channelId": t}
    # Fallback: treat as a handle-ish query
    return {"handle": t.lstrip("@")}

def get_channel_id(youtube, channel_input: str) -> Optional[str]:
    ref = parse_channel_id_or_handle(channel_input)
    if "channelId" in ref:
        return ref["channelId"]

    # Resolve handle via search (type=channel). This works for @handles and most names.
    q = ref["handle"]
    search = youtube.search().list(
        part="snippet",
        q=q,
        type="channel",
        maxResults=1
    ).execute()
    items = search.get("items", [])
    if items:
        return items[0]["snippet"]["channelId"]

    # Last resort: channels.list forUsername (legacy usernames)
    ch = youtube.channels().list(part="id", forUsername=q).execute()
    if ch.get("items"):
        return ch["items"][0]["id"]
    return None

def get_uploads_playlist_id(youtube, channel_id: str) -> Optional[str]:
    resp = youtube.channels().list(part="contentDetails", id=channel_id, maxResults=1).execute()
    items = resp.get("items", [])
    if not items:
        return None
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

def iterate_playlist_items(youtube, playlist_id: str):
    page_token = None
    while True:
        resp = youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=playlist_id,
            maxResults=50,
            pageToken=page_token
        ).execute()
        for it in resp.get("items", []):
            yield it
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

def chunked(lst: List[str], n: int):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def fetch_video_stats(youtube, video_ids: List[str]) -> Dict[str, dict]:
    out = {}
    for batch in chunked(video_ids, 50):
        resp = youtube.videos().list(
            part="snippet,contentDetails,statistics",
            id=",".join(batch),
            maxResults=50
        ).execute()
        for v in resp.get("items", []):
            out[v["id"]] = v
    return out

def to_dt(s: str) -> datetime:
    # publishedAt is ISO 8601 with Z
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

# -------- Streamlit UI --------

st.set_page_config(page_title="YouTube Channel Sorter", page_icon="📺", layout="wide")
st.title("YouTube channel video sorter")
st.caption("Sort a channel's uploads by view count within a date range.")

api_key = st.text_input("YouTube Data API key", type="password", help="Create this in Google Cloud Console → YouTube Data API v3")
channel_input = st.text_input("Channel handle or URL", placeholder="@LinusTechTips or https://www.youtube.com/@LinusTechTips")

col1, col2, col3 = st.columns([1,1,1])
default_end = datetime.now(timezone.utc).date()
default_start = default_end - timedelta(days=365)
with col1:
    start_date = st.date_input("Start date", value=default_start)
with col2:
    end_date = st.date_input("End date", value=default_end)
with col3:
    limit_results = st.number_input("Max videos to fetch (0 for all)", min_value=0, max_value=5000, value=0, step=50, help="Use to reduce quota on giant channels")

run = st.button("Fetch and sort")

if run:
    if not api_key:
        st.error("Please enter your API key.")
        st.stop()
    if not channel_input.strip():
        st.error("Please enter a channel handle or URL.")
        st.stop()

    try:
        youtube = build("youtube", "v3", developerKey=api_key)
    except Exception as e:
        st.error(f"Failed to create API client: {e}")
        st.stop()

    with st.spinner("Resolving channel..."):
        channel_id = get_channel_id(youtube, channel_input)
    if not channel_id:
        st.error("Could not resolve the channel. Try pasting the channel URL or the @handle.")
        st.stop()

    with st.spinner("Finding uploads playlist..."):
        uploads_pid = get_uploads_playlist_id(youtube, channel_id)
    if not uploads_pid:
        st.error("Could not find the uploads playlist for this channel.")
        st.stop()

    # Pull playlist items and collect video IDs with publishedAt filter early
    start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=timezone.utc)

    collected = []
    with st.spinner("Listing channel uploads..."):
        for item in iterate_playlist_items(youtube, uploads_pid):
            sn = item["snippet"]
            vid = item["contentDetails"]["videoId"]
            pub = to_dt(sn["publishedAt"])
            if start_dt <= pub <= end_dt:
                collected.append({"videoId": vid, "publishedAt": pub})
            # Optional soft limit for quota
            if limit_results and len(collected) >= limit_results:
                break

    if not collected:
        st.info("No videos in that date range.")
        st.stop()

    with st.spinner("Fetching video statistics..."):
        id_list = [c["videoId"] for c in collected]
        stats = fetch_video_stats(youtube, id_list)

    # Build rows
    rows = []
    for c in collected:
        v = stats.get(c["videoId"])
        if not v:
            continue
        sn = v["snippet"]
        stx = v.get("statistics", {})
        views = int(stx.get("viewCount", 0))
        title = sn.get("title", "")
        published = to_dt(sn["publishedAt"])
        thumb = sn.get("thumbnails", {}).get("medium", {}).get("url") or sn.get("thumbnails", {}).get("default", {}).get("url")
        url = f"https://www.youtube.com/watch?v={c['videoId']}"
        rows.append({
            "Title": title,
            "Views": views,
            "Published": published,
            "Duration": v.get("contentDetails", {}).get("duration", ""),
            "Video URL": url,
            "Thumb": thumb
        })

    # Sort by views desc
    rows.sort(key=lambda r: r["Views"], reverse=True)

    # Show summary
    st.success(f"Found {len(rows)} videos between {start_date} and {end_date}. Sorted by view count descending.")

    # Fancy cards
    for r in rows:
        with st.container(border=True):
            c1, c2 = st.columns([1,5])
            with c1:
                if r["Thumb"]:
                    st.image(r["Thumb"])
            with c2:
                st.markdown(f"**[{r['Title']}]({r['Video URL']})**")
                st.write(f"Views: {r['Views']:,}")
                st.write(f"Published: {r['Published'].strftime('%Y-%m-%d')}")
                if r["Duration"]:
                    st.write(f"ISO 8601 Duration: {r['Duration']}")

    # Download as CSV
    import pandas as pd
    import io
    df = pd.DataFrame(rows)
    csv = df.drop(columns=["Thumb"]).copy()
    csv["Published"] = csv["Published"].dt.strftime("%Y-%m-%d %H:%M:%S")
    buffer = io.StringIO()
    csv.to_csv(buffer, index=False)
    st.download_button("Download CSV", data=buffer.getvalue(), file_name="channel_videos_sorted.csv", mime="text/csv")
