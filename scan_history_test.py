import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


temp_dir = tempfile.mkdtemp(prefix="wit-history-test-")
os.environ["WIT_HISTORY_DB_PATH"] = str(Path(temp_dir) / "history.db")

from backend import history
from backend import main

history.init_db()
completed_id = history.create_scan("malaria", "smear.png", "efficientnet_b3-224")
history.update_scan(
    completed_id,
    status="Completed",
    predicted_class="Parasitized",
    confidence=0.986,
    thumbnail_data_url="data:image/jpeg;base64,thumbnail",
)
failed_id = history.create_scan("leukemia", "broken.png", "efficientnet_b3-224")
history.update_scan(failed_id, status="Failed", error_message="invalid image")

listing = history.list_scans(sort="oldest")
assert listing["total"] == 2
assert listing["items"][0]["scan_id"] == completed_id
assert listing["summary"]["diseases_analyzed"] == 2
assert history.list_scans(search="malaria")["total"] == 1
assert history.get_scan(failed_id)["error_message"] == "invalid image"


class FakeDetector:
    def predict(self, _image_bytes):
        return {
            "predicted_class": "Uninfected",
            "confidence": 0.91,
            "class_probabilities": {"Parasitized": 0.09, "Uninfected": 0.91},
            "gradcam_image_base64": "ZmFrZQ==",
        }


main.detectors.clear()
main.detectors["malaria"] = FakeDetector()
client = TestClient(main.app)
prediction = client.post(
    "/predict/malaria",
    files={"file": ("sample.png", b"fake image", "image/png")},
)
assert prediction.status_code == 200, prediction.text
assert prediction.json()["scan_id"].startswith("SCN-")

api_history = client.get("/history", params={"module": "malaria"})
assert api_history.status_code == 200, api_history.text
assert api_history.json()["total"] == 2
assert api_history.json()["items"][0]["status"] == "Completed"

main.detectors.clear()
original_loader = main.load_available_detectors
main.load_available_detectors = lambda names=None: {}
try:
    failed_prediction = client.post(
        "/predict/malaria",
        files={"file": ("missing.png", b"fake image", "image/png")},
    )
finally:
    main.load_available_detectors = original_loader
assert failed_prediction.status_code == 503
failed_api_history = client.get("/history", params={"status": "Failed"})
assert failed_api_history.status_code == 200
assert failed_api_history.json()["total"] == 2
client.close()

print("history repository: PASS")
print("prediction success record: PASS")
print("prediction failure record: PASS")
print("history API filters and detail data: PASS")
