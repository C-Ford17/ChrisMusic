from flask import Flask, jsonify, request, Response, send_file
from flask_cors import CORS
import yt_dlp
import logging
import os
import subprocess
import tempfile


app = Flask(__name__)
app.url_map.strict_slashes = False # Allow /route and /route/ to match the same
CORS(app) # Allow CORS for local development

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- FUNCIÓN MÁGICA PARA EVADIR EL BLOQUEO DE BOT ---
def safe_extract(url, base_opts, action="extract"):
    """
    Intenta extraer o descargar usando diferentes clientes de YouTube en cascada.
    """
    COOKIES_FILE = 'cookies.txt'
    
    # Lista expandida de clientes para mayor resiliencia
    clients = [
        ['ios', 'android'], 
        ['android_music', 'android'],
        ['tv_embedded', 'web_creator'], 
        ['android_vr', 'android'],
        ['web_embedded'],
        ['mweb'],
        ['web']
    ]
    
    last_error = None
    cookies_available = os.path.exists(COOKIES_FILE)

    # Intento 1: Con Cookies (si existen)
    if cookies_available:
        for client_list in clients:
            opts = base_opts.copy()
            opts['extractor_args'] = {'youtube': {'player_client': client_list}}
            opts['cookiefile'] = COOKIES_FILE
            
            try:
                logger.info(f"Probando con cookies + cliente: {client_list}")
                with yt_dlp.YoutubeDL(opts) as ydl:
                    if action == "download":
                        ydl.download([url])
                        return True
                    else:
                        return ydl.extract_info(url, download=False)
            except Exception as e:
                last_error = str(e)
                logger.warning(f"Fallo con cookies + {client_list}: {last_error}")
                # Seguimos intentando con el próximo cliente
                continue

    # Intento 2: Sin Cookies (como último recurso o si no hay archivo)
    logger.info("Intentando extracción básica sin cookies como último recurso...")
    for client_list in [['tv_embedded'], ['web']]:
        opts = base_opts.copy()
        opts['extractor_args'] = {'youtube': {'player_client': client_list}}
        if 'cookiefile' in opts: del opts['cookiefile']
        
        try:
            logger.info(f"Probando SIN cookies + cliente: {client_list}")
            with yt_dlp.YoutubeDL(opts) as ydl:
                if action == "download":
                    ydl.download([url])
                    return True
                else:
                    return ydl.extract_info(url, download=False)
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Fallo final sin cookies + {client_list}: {last_error}")

    # Si llegamos aquí, nada funcionó
    raise Exception(f"YouTube bloqueó todos los intentos (Last Error: {last_error}). Prueba a subir cookies nuevas.")

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
    }
    
    try:
        data = safe_extract(f"ytsearch{fetch_count}:{query}", opts)
            
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
        'format': 'bestaudio/best', # More flexible: any best audio
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    
    try:
        info = safe_extract(f"https://www.youtube.com/watch?v={video_id}", opts)
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
        'format': 'bestaudio/best', # Let FFmpeg handle the conversion from any best audio
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    
    try:
        info = safe_extract(f"https://www.youtube.com/watch?v={video_id}", opts)
        url = info.get('url', '')
        if not url:
            return "No URL found", 404
            
        def generate():
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
    video_id = request.args.get('id', '')
    if not video_id:
        return "No ID provided", 400

    logger.info(f"Download (completo) para: {video_id}")
    tmp_dir = tempfile.mkdtemp()
    tmp_file = os.path.join(tmp_dir, f"{video_id}.m4a")

    opts = {
        'format': 'bestaudio/best',
        'outtmpl': tmp_file,
        'quiet': True,
        'no_warnings': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'aac',
        }],
    }

    try:
        safe_extract(f"https://www.youtube.com/watch?v={video_id}", opts, action="download")

        actual_file = tmp_file if os.path.exists(tmp_file) else tmp_file.replace('.m4a', '.aac')
        if not os.path.exists(actual_file):
            candidates = [os.path.join(tmp_dir, f) for f in os.listdir(tmp_dir)]
            actual_file = candidates[0] if candidates else None

        if not actual_file or not os.path.exists(actual_file):
            return "Audio file not found after download", 500

        logger.info(f"Sirviendo {actual_file} ({os.path.getsize(actual_file)} bytes)")
        response = send_file(actual_file, mimetype='audio/aac', as_attachment=False)
        
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

@app.route('/health')
def health():
    return jsonify({"status": "ok", "message": "API is running"}), 200

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
    }
    
    try:
        info = safe_extract(f"https://www.youtube.com/watch?v={video_id}", opts)
            
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

@app.route('/update-cookies', methods=['POST', 'OPTIONS'])
def update_cookies():
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        # Use force=True to parse JSON even if Content-Type is not application/json
        data = request.get_json(force=True, silent=True)
        
        if not data:
            # Fallback for form data or plain text
            data = request.form.to_dict() if request.form else {}
        
        contents = data.get('contents', '')
        
        # Fallback if the body was just the string contents
        if not contents and request.data:
            try:
                contents = request.data.decode('utf-8')
            except:
                pass

        if not contents:
            return jsonify({"error": "No contents detected in request body"}), 400
        
        with open('cookies.txt', 'w', encoding='utf-8') as f:
            f.write(contents)
        
        logger.info("Cookies updated successfully via remote request")
        return jsonify({"message": "Cookies updated successfully"})
    except Exception as e:
        logger.error(f"Update cookies error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)