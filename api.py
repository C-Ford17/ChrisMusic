from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import logging
import os # Añade esto al principio


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
    
    logger.info(f"Searching for: {query}")
    opts = {
        'quiet': True,
        'extract_flat': True,
        'skip_download': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            data = ydl.extract_info(f"ytsearch10:{query}", download=False)
            
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
        return jsonify(results)
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/stream')
def stream():
    video_id = request.args.get('id', '')
    if not video_id:
        return jsonify({"error": "No ID provided"}), 400
        
    logger.info(f"Getting stream for: {video_id}")
    opts = {
        'quiet': True,
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'no_warnings': True,
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

if __name__ == '__main__':
    # Usa el puerto que da Railway o 5000 por defecto
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
