"""Small dependency-free PDF output for persistent scan history records."""


def _escape(value: object) -> str:
    return str(value or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_history_pdf(record: dict) -> bytes:
    module = str(record.get("module", "analysis")).title()
    probabilities = record.get("class_probabilities") or {}
    lines = [
        "WIT RESEARCH & ANALYSIS",
        "SCAN HISTORY REPORT",
        f"Module: {module}",
        f"Scan ID: {record.get('scan_id', 'Not available')}",
        f"Performed: {record.get('created_at', 'Not available')}",
        f"Prediction: {record.get('predicted_class') or 'No result'}",
        f"Confidence: {float(record.get('confidence') or 0) * 100:.2f}%",
        f"Status: {record.get('status', 'Not available')}",
        f"Patient name: {record.get('patient_name') or 'Not provided'}",
        f"Age / gender: {' / '.join(filter(None, [record.get('patient_age'), record.get('patient_gender')])) or 'Not provided'}",
        f"Sample ID: {record.get('patient_sample_id') or 'Not provided'}",
        f"Scan date: {record.get('patient_date') or 'Not provided'}",
        "Class probabilities:",
    ]
    lines.extend(f"  {name}: {float(value) * 100:.2f}%" for name, value in probabilities.items())
    lines.extend([
        "",
        "Research and educational output only.",
        "This record is not a validated clinical diagnosis.",
        "Walchand Institute of Technology, Solapur | WIT Research & Analysis",
    ])
    commands = ["BT", "/F1 10 Tf", "50 790 Td"]
    for index, line in enumerate(lines):
        if index:
            commands.append("0 -18 Td")
        commands.append(f"({_escape(line)[:180]}) Tj")
    commands.append("ET")
    stream = "\n".join(commands)
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream.encode('latin-1', 'replace'))} >>\nstream\n{stream}\nendstream",
    ]
    pdf = "%PDF-1.4\n%WIT\n"
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf.encode("latin-1")))
        pdf += f"{index} 0 obj\n{obj}\nendobj\n"
    xref = len(pdf.encode("latin-1"))
    pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    pdf += "".join(f"{offset:010d} 00000 n \n" for offset in offsets[1:])
    pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return pdf.encode("latin-1", "replace")
