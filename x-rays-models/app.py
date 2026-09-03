from flask import Flask, request, jsonify, send_from_directory
import os, cv2, numpy as np, torch
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
from PIL import Image
import tensorflow as tf
from transformers import AutoImageProcessor, AutoModelForImageClassification
from tensorflow.keras.utils import load_img, img_to_array
from gradcam import generate_gradcam
from reportlab.platypus import SimpleDocTemplate, Paragraph, Image as RLImage, Spacer
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet

app = Flask(__name__)


UPLOAD_FOLDER = 'uploads'
HEATMAP_FOLDER = 'static/heatmaps'
PDF_FOLDER = 'uploads/reports'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(HEATMAP_FOLDER, exist_ok=True)
os.makedirs(PDF_FOLDER, exist_ok=True)


MODEL_DIR = 'models'
X_RAY_MODEL_PATH = "xray_classifier.keras"
X_RAY_THRESHOLD = float(os.environ.get('X_RAY_THRESHOLD', 0.8))

xray_model = tf.keras.models.load_model(X_RAY_MODEL_PATH, compile=False)
processor = AutoImageProcessor.from_pretrained(MODEL_DIR, local_files_only=True)
fracture_model = AutoModelForImageClassification.from_pretrained(MODEL_DIR, local_files_only=True)
fracture_model.eval()

def preprocess_xray(img_path):
    img = load_img(img_path, target_size=(224, 224))
    return tf.expand_dims(img_to_array(img), axis=0)

def find_gradcam_layer(model):
    for name, module in reversed(list(model.named_modules())):
        if isinstance(module, torch.nn.Conv2d):
            return module
    raise ValueError("No Conv2d layer found.")

def create_pdf(original_path, heatmap_path, label, confidence):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    pdf_filename = f"report_{timestamp}.pdf"
    pdf_path = os.path.join(PDF_FOLDER, pdf_filename)

    doc = SimpleDocTemplate(pdf_path, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

 
    story.append(Paragraph("Uploaded X-Ray:", styles['Heading3']))
    story.append(RLImage(original_path, width=400, height=400))
    story.append(Spacer(1, 20))


    if heatmap_path and os.path.exists(heatmap_path):
        story.append(Paragraph("Fracture Heatmap:", styles['Heading3']))
        story.append(RLImage(heatmap_path, width=400, height=400))
        story.append(Spacer(1, 20))


    story.append(Paragraph("🩻 Bone Fracture Detection Result", styles['Heading3']))
    story.append(Paragraph(f"<b>Result:</b> {label.upper()}", styles['Normal']))
    story.append(Paragraph(f"<b>Confidence:</b> {float(confidence):.2f}%", styles['Normal']))

    doc.build(story)
    return pdf_filename



@app.route('/heatmaps/<filename>')
def get_heatmap(filename):
    return send_from_directory(HEATMAP_FOLDER, filename)

@app.route('/reports/<filename>')
def get_report(filename):
    return send_from_directory(PDF_FOLDER, filename)



@app.route('/verify-xray', methods=['POST'])
def verify_xray():
    """Lightweight check used at upload time: runs only the keras
    x-ray/not-x-ray classifier, skips the fracture model, gradcam and
    PDF generation, and doesn't keep the file around."""
    file = request.files.get('xray')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    filename = datetime.now().strftime("%Y%m%d%H%M%S_") + file.filename
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    try:
        xray_score = float(xray_model.predict(preprocess_xray(filepath))[0][0])
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)

    return jsonify({
        "is_xray": xray_score > X_RAY_THRESHOLD,
        "score": xray_score
    })


@app.route('/predict', methods=['POST'])
def predict():
    file = request.files.get('xray')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    filename = datetime.now().strftime("%Y%m%d%H%M%S_") + file.filename
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)


    xray_score = xray_model.predict(preprocess_xray(filepath))[0][0]
    xray_check = "X-RAY Detected" if xray_score > X_RAY_THRESHOLD else "Not an X-RAY"

    if xray_score <= X_RAY_THRESHOLD:
        return jsonify({
            "xray_check": xray_check,
            "prediction": None,
            "confidence": None,
            "heatmap": None,
            "filename": filename,
            "pdf": None
        })


    image = Image.open(filepath).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    pixel_values = inputs['pixel_values']

    with torch.no_grad():
        outputs = fracture_model(pixel_values)
        pred_idx = outputs.logits.argmax(-1).item()
        predicted_label = fracture_model.config.id2label[pred_idx]
        confidence = torch.nn.functional.softmax(outputs.logits, dim=1)[0][pred_idx].item() * 100

   
    target_layer = find_gradcam_layer(fracture_model)
    cam = generate_gradcam(fracture_model, pixel_values, target_layer)
    if "normal" in predicted_label.lower():
        cam = np.zeros_like(cam)

    img_np = np.array(image)
    heatmap_resized = cv2.resize(cam, image.size)
    colored_heatmap = cv2.applyColorMap(np.uint8(255 * heatmap_resized), cv2.COLORMAP_JET)
    overlay = cv2.addWeighted(cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR), 0.6, colored_heatmap, 0.4, 0)

    heatmap_filename = "heatmap_" + filename
    heatmap_path = os.path.join(HEATMAP_FOLDER, heatmap_filename)
    cv2.imwrite(heatmap_path, overlay)


    pdf_filename = create_pdf(filepath, heatmap_path, predicted_label, confidence)

 
    base_url = request.host_url.rstrip('/')
    heatmap_url = f"{base_url}/heatmaps/{heatmap_filename}"
    pdf_url = f"{base_url}/reports/{pdf_filename}"

    return jsonify({
        "xray_check": xray_check,
        "prediction": predicted_label,
        "confidence": round(confidence, 2),
        "heatmap": heatmap_url,
        "filename": filename,
        "pdf": pdf_url
    })


if __name__ == '__main__':
    # Bind to 127.0.0.1 by default so this is never reachable from outside the
    # host it's running on — Node is the only thing that should ever talk to
    # it. Override FLASK_HOST/PORT only when you know why (e.g. containerized
    # deployment where Node and Flask are separate containers).
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host=host, port=port, debug=debug, use_reloader=False)
