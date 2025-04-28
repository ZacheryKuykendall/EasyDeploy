import os
from flask import Flask, jsonify

app = Flask(__name__)

# Get environment variables
env = os.environ.get("ENVIRONMENT", "development")
log_level = os.environ.get("LOG_LEVEL", "info")

@app.route('/')
def hello():
    return jsonify({
        "message": "Hello from EasyDeploy!",
        "environment": env,
        "log_level": log_level
    })

@app.route('/health')
def health():
    return jsonify({
        "status": "healthy"
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port) 