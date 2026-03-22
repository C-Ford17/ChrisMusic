from flask import Flask, jsonify, request, Response, send_file
from flask_cors import CORS
import yt_dlp
import logging
import os
import subprocess
import tempfile


app = Flask(__name__)
CORS(app) # Allow CORS for local development

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/search')
def search():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    count = min(int(request.args.get('count', 10)), 50)  # max 50
    offset = int(request.args.get('offset', 0))
    fetch_count = offset + count  # fetch enough to slice

    logger.info(f"Searching for: {query} (count={count}, offset={offset})")
    opts = {
        'quiet': True,
        'extract_flat': True,
        'skip_download': True,
        'no_warnings': True,
        'extractor_args': {'youtube': {'player_client': ['android', 'web']}},
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            data = ydl.extract_info(f"ytsearch{fetch_count}:{query}", download=False)
            
        results = []
        for e in data.get('entries', []):
            if not e: continue
            results.append({
                'id': e.get('id', ''),
                'title': e.get('title', ''),
                'artistName': e.get('uploader', e.get('channel', 'Unknown')),
                'thumbnailUrl': f"https://img.youtube.com/vi/{e.get('id', '')}/mqdefault.jpg",
                'duration': e.get('duration', 0),
                'sourceType': 'youtube'
            })
        return jsonify(results[offset:offset + count])
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/stream')
def stream():
    video_id = request.args.get('id', '')
    if not video_id:
        return jsonify({"error": "No ID provided"}), 400
        
    logger.info(f"Getting direct stream for: {video_id}")
    opts = {
        'format': 'bestaudio[ext=webm]/bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'extractor_args': {'youtube': {'player_client': ['android', 'web']}},
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", 
                download=False
            )
        return jsonify({'url': info.get('url', '')})
    except Exception as e:
        logger.error(f"Stream error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/proxy')
def proxy():
    video_id = request.args.get('id', '')
    if not video_id:
        return "No ID provided", 400
        
    logger.info(f"Iniciando FFmpeg Proxy (AAC) para: {video_id}")
    opts = {
        # M4A (AAC) es crucial: allows -acodec copy to ADTS, WEBM/OPUS is incompatible with -f adts
        'format': 'bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'extractor_args': {'youtube': {'player_client': ['android', 'web']}},
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", 
                download=False
            )
            url = info.get('url', '')
            if not url:
                return "No URL found", 404
                
            def generate():
                # Re-encode at 128kbps AAC for smaller file size (~40% less than copy)
                # -acodec aac -b:a 128k ensures consistent ADTS output regardless of source
                process = subprocess.Popen(
                    ['ffmpeg', '-i', url, '-vn', '-acodec', 'aac', '-b:a', '128k', '-f', 'adts', '-'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL
                )
                try:
                    while True:
                        data = process.stdout.read(8192)
                        if not data:
                            break
                        yield data
                finally:
                    process.kill()

            return Response(generate(), mimetype='audio/aac', headers={
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma': 'no-cache'
            })
    except Exception as e:
        logger.error(f"Proxy error: {str(e)}")
        return str(e), 500

@app.route('/download')
def download():
    """Descarga el audio completo a un fichero temporal y lo sirve como binario.
    Esto permite que CapacitorHttp lo descargue de un solo golpe sin problemas de streaming chunked."""
    video_id = request.args.get('id', '')
    if not video_id:
        return "No ID provided", 400

    logger.info(f"Download (completo) para: {video_id}")
    tmp_dir = tempfile.mkdtemp()
    tmp_file = os.path.join(tmp_dir, f"{video_id}.m4a")

    opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'outtmpl': tmp_file,
        'quiet': True,
        'no_warnings': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'aac',
        }],
        'extractor_args': {'youtube': {'player_client': ['android', 'web']}},
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

        # yt-dlp puede renombrar el archivo si hace conversión
        actual_file = tmp_file if os.path.exists(tmp_file) else tmp_file.replace('.m4a', '.aac')
        if not os.path.exists(actual_file):
            # fallback: buscar el primero que tengamos en tmp_dir
            candidates = [os.path.join(tmp_dir, f) for f in os.listdir(tmp_dir)]
            actual_file = candidates[0] if candidates else None

        if not actual_file or not os.path.exists(actual_file):
            return "Audio file not found after download", 500

        logger.info(f"Sirviendo {actual_file} ({os.path.getsize(actual_file)} bytes)")
        response = send_file(actual_file, mimetype='audio/aac', as_attachment=False)
        # Cleanup temp file after sending
        @response.call_on_close
        def cleanup():
            try:
                os.remove(actual_file)
                os.rmdir(tmp_dir)
            except Exception:
                pass
        return response

    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return str(e), 500

@app.route('/formats')
def formats():
    video_id = request.args.get('id', '')
    if not video_id:
        return jsonify({"error": "No ID provided"}), 400
        
    logger.info(f"Getting formats for: {video_id}")
    opts = {
        'quiet': True,
        'extract_flat': False,
        'no_warnings': True,
        'extractor_args': {'youtube': {'player_client': ['android', 'web']}},
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", 
                download=False
            )
            
            formats_list = []
            for f in info.get('formats', []):
                formats_list.append({
                    'format_id': f.get('format_id', ''),
                    'ext': f.get('ext', ''),
                    'vcodec': f.get('vcodec', 'none'),
                    'acodec': f.get('acodec', 'none'),
                    'filesize': f.get('filesize', 0),
                    'tbr': f.get('tbr', 0),
                    'format_note': f.get('format_note', ''),
                    'url': f.get('url', '')
                })
                
        return jsonify({'formats': formats_list})
    except Exception as e:
        logger.error(f"Formats error: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Usa el puerto que da Railway o 5000 por defecto
    port = int(os.environ.get('PORT', 5000))
    # debug=False en produccion (Railway). Solo activar localmente.
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
