"""Read a local official NBA landscape injury PDF; never fetch or bypass access controls.
Raw PDF and extracted rows stay in ignored private data directories.
"""
import hashlib, json, re, sys
from pathlib import Path
import pdfplumber

path, output = map(Path, sys.argv[1:3])
rows, headers = [], []
state = {"gameDate": None, "matchup": None, "teamToken": None}
statuses = {"Out", "Doubtful", "Questionable", "Probable", "Available"}
with pdfplumber.open(path) as pdf:
    for page_no, page in enumerate(pdf.pages, 1):
        text = page.extract_text() or ""
        match = re.search(r"Injury\s+Report:\s*(\d\d/\d\d/\d\d)\s+(\d\d:\d\d)\s+(AM|PM)", text)
        if not match or abs(page.width - 841.95) > 5:
            raise ValueError("Unrecognised report header or layout; manual review required")
        headers.append(" ".join(match.groups()))
        body_top = 120 if page_no == 1 else 75
        words = [w for w in page.extract_words() if body_top < w["top"] < 535]
        anchors = [w for w in words if (580 <= w["x0"] < 660 and w["text"] in statuses) or "NOTYETSUBMITTED" == re.sub(r"\W", "", w["text"]).upper()]
        anchors.sort(key=lambda w: w["top"])
        orphan = [w for w in words if anchors and w["x0"] >= 660 and w["top"] < anchors[0]["top"]-10]
        if orphan and rows:
            rows[-1]["reason"] += " " + " ".join(w["text"] for w in orphan)
        for i, anchor in enumerate(anchors):
            y = anchor["top"]
            for w in words:
                if w["top"] > y + 3:
                    continue
                if w["x0"] < 110 and re.fullmatch(r"\d\d/\d\d/\d{4}", w["text"]):
                    state["gameDate"] = w["text"]
                if 195 <= w["x0"] < 260 and re.fullmatch(r"[A-Z]{2,3}@[A-Z]{2,3}", w["text"]):
                    state["matchup"] = w["text"]
            team_words = [w for w in words if 260 <= w["x0"] < 420 and abs(w["top"]-y) <= 3]
            if team_words:
                state["teamToken"] = " ".join(w["text"] for w in team_words)
            player = " ".join(w["text"] for w in words if 420 <= w["x0"] < 580 and abs(w["top"]-y) <= 3)
            low = (anchors[i-1]["top"]+y)/2 if i else max(body_top, y-10)
            high = (y+anchors[i+1]["top"])/2 if i+1 < len(anchors) else 535
            reason = " ".join(w["text"] for w in words if w["x0"] >= 660 and low <= w["top"] < high)
            if not all(state.values()):
                raise ValueError("Missing carried date/matchup/team; manual review required")
            status = anchor["text"] if anchor["text"] in statuses else "Not submitted"
            rows.append({**state, "playerToken": player or None, "status": status, "reason": reason, "page": page_no})
    pages = len(pdf.pages)
if len(set(headers)) != 1 or not rows:
    raise ValueError("Conflicting report timestamps or no extracted rows")
output.write_text(json.dumps({"fileSha256": hashlib.sha256(path.read_bytes()).hexdigest(), "reportHeader": headers[0], "pageCount": pages, "rows": rows}, indent=2), encoding="utf-8")
print(json.dumps({"pages": pages, "rows": len(rows), "header": headers[0]}))
