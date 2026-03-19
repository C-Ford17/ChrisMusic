import { NextResponse } from 'next/server';

// Global bypass for SSL errors in this route
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get('url');

  // Case 1: Proxy direct file download
  if (fileUrl) {
    try {
      const response = await fetch(fileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (!response.ok) return NextResponse.json({ error: 'Failed to fetch file' }, { status: response.status });
      
      return new NextResponse(response.body, {
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Length': response.headers.get('Content-Length') || '',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Case 2: Proxy Piped JSON request (Discovery)
  const instance = searchParams.get('instance');
  const videoId = searchParams.get('videoId');

  if (!instance || !videoId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const streamInfoUrl = `${instance}/streams/${videoId}`;
    const response = await fetch(streamInfoUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
        return NextResponse.json({ error: `Piped API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
