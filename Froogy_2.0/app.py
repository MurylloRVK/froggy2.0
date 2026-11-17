from flask import Flask, jsonify, render_template

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "game": "Froogy 2.0"})


if __name__ == "__main__":
    # Acesse http://127.0.0.1:5000 no navegador.
    app.run(host="127.0.0.1", port=5000, debug=True)
