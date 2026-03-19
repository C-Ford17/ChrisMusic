import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'YouTube API Key is missing' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${encodeURIComponent(
        q
      )}&key=${apiKey}`
    );

    if (!res.ok) {
      throw new Error(`YouTube API error: ${res.statusText}`);
    }

    const data = await res.json();
    
    // Map to a simpler format for our frontend
    const results = data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      artistName: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails.high.url || item.snippet.thumbnails.default.url,
      sourceType: 'youtube',
    }));

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('YouTube search error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
