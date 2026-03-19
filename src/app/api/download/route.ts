import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST(request: Request) {
  try {
    const { videoId } = await request.json();
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Determinamos la ruta del binario de forma manual y segura
    const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const binPath = process.platform === 'win32' 
      ? path.join(process.cwd(), binName) 
      : '/usr/local/bin/yt-dlp';

    // Construimos el comando directamente
    // Usamos comillas para evitar problemas con espacios en rutas de Windows
    const command = `"${binPath}" "${videoUrl}" --dump-single-json --no-check-certificates --no-warnings --format "bestaudio[ext=m4a]/bestaudio/best"`;

    const { stdout, stderr } = await execPromise(command);

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    const output = JSON.parse(stdout);

    if (!output || !output.url) {
      throw new Error('No valid audio URL in yt-dlp output');
    }

    return NextResponse.json({ 
      url: output.url,
      title: output.title,
      duration: output.duration,
      format: output.ext || 'm4a'
    });

  } catch (error: any) {
    console.error('Extraction error:', error.message);
    return NextResponse.json({ error: 'Our download engine failed. Check if yt-dlp.exe is in the root folder.' }, { status: 500 });
  }
}
