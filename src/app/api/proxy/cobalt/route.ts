import { NextResponse } from 'next/server';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function POST(request: Request) {
  try {
    const { videoId } = await request.json();
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Payload simplificado al máximo para evitar el error 400
    const cobaltPayload = {
      url: videoUrl,
      audioFormat: 'mp3',
      downloadMode: 'audio'
    };

    const instances = [
      'https://api.cobalt.tools/api/json',
      'https://cobalt.api.unblocker.it/api/json',
      'https://api.kuko.rip/api/json',
      'https://cobalt.instawinstreak.com/api/json'
    ];

    for (const instance of instances) {
      try {
        const response = await fetch(instance, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cobaltPayload)
        });

        if (!response.ok) continue;

        const data = await response.json();
        if (data.url) return NextResponse.json(data);
      } catch (e: any) {
        continue;
      }
    }

    // Fallback: Si Cobalt falla, intentamos Piped directamente desde el servidor pero a una instancia estable
    try {
      const pipedResponse = await fetch(`https://pipedapi.lunar.icu/streams/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (pipedResponse.ok) {
        const pipedData = await pipedResponse.json();
        const audioStream = pipedData.audioStreams?.find((s: any) => s.bitrate > 0);
        if (audioStream?.url) return NextResponse.json({ url: audioStream.url });
      }
    } catch (e) {}

    return NextResponse.json({ error: 'All download engines failed' }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
