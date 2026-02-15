from flask import Flask, render_template, request, jsonify
import requests, re, time, json, base64
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor
import validators
from playwright.sync_api import sync_playwright

app = Flask(__name__)

EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
HEADERS = {"User-Agent": "Mozilla/5.0"}
def normalize_obfuscated(text):
    text = text.replace(" [at] ", "@").replace("(at)", "@")
    text = text.replace(" [dot] ", ".").replace("(dot)", ".")
    return text

# ---------------- UTILS ----------------

def is_valid_url(url):
    try:
        p = urlparse(url)
        return p.scheme and p.netloc
    except:
        return False

# ---------------- CLOUDFLARE DECODE ----------------

def decode_cf_email(encoded):
    r = int(encoded[:2], 16)
    return ''.join(chr(int(encoded[i:i+2], 16) ^ r) for i in range(2, len(encoded), 2))

# ---------------- FAST HTML SCAN ----------------

def fast_extract(url):
    emails = set()
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return emails

        html = normalize_obfuscated(r.text)
        soup = BeautifulSoup(html, "html.parser")

        # Normal emails
        emails.update(re.findall(EMAIL_REGEX, html))

        # mailto
        for a in soup.find_all("a", href=True):
            if a["href"].lower().startswith("mailto:"):
                emails.add(a["href"].split(":")[1].split("?")[0])

        # Cloudflare emails
        for tag in soup.select("span.__cf_email__"):
            encoded = tag.get("data-cfemail")
            if encoded:
                emails.add(decode_cf_email(encoded))

    except:
        pass

    return emails

# ---------------- DEEP JS SCAN ----------------

def deep_extract(url):
    emails = set()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=HEADERS["User-Agent"])

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(8000)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

            html = normalize_obfuscated(page.content())
            browser.close()

            emails.update(re.findall(EMAIL_REGEX, html))

    except:
        pass

    return emails


# ---------------- INTERNAL LINK CRAWL ----------------

def crawl_internal_pages(base_url, limit=15):
    urls = set()
    base_domain = urlparse(base_url).netloc
    try:
        r = requests.get(base_url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")

        for a in soup.find_all("a", href=True):
            link = urljoin(base_url, a["href"])
            parsed = urlparse(link)

            if parsed.netloc == base_domain and len(urls) < limit:
                urls.add(link)

    except:
        pass

    return urls

# ---------------- MASTER PROCESS ----------------

def extract_emails_global(url):
    found = set()

    # Force JS scan for faculty/staff pages
    if any(k in url.lower() for k in ["faculty", "staff", "people"]):
        found |= deep_extract(url)

    found |= fast_extract(url)
    
    for sub in crawl_internal_pages(url):
        found |= fast_extract(sub)
        if not found:
            found |= deep_extract(sub)

    return found


# ---------------- ROUTES ----------------

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/extract", methods=["POST"])
def extract():
    data = request.json
    urls = list(set(data.get("urls", [])))
    filter_type = data.get("filter", "valid")

    final_urls = []
    for u in urls:
        if not u.startswith(("http://", "https://")):
            u = "https://" + u
        if is_valid_url(u):
            final_urls.append(u)

    if not final_urls:
        return jsonify({"status": "error", "emails": [], "count": 0})

    start = time.time()
    all_emails = set()

    with ThreadPoolExecutor(max_workers=4) as exe:
        for result in exe.map(extract_emails_global, final_urls):
            all_emails |= result

    # ------------------------------------------------------------------
    # ✅ NEW: STRUCTURED EMAIL OBJECTS (WITHOUT REMOVING OLD LOGIC)
    # ------------------------------------------------------------------

    structured_results = []
    valid_count = 0
    invalid_count = 0

    for email in sorted(all_emails):
        is_valid = validators.email(email)
        domain = email.split("@")[-1]

        if is_valid:
            valid_count += 1
        else:
            invalid_count += 1

        structured_results.append({
            "email": email,              # Email Address
            "status": "Valid" if is_valid else "Invalid",
            "domain": domain,
            "source": "Website",         # Can be improved later
            "actions": ["copy"]          # UI helper
        })

    # Apply filter (valid / invalid / all)
    if filter_type == "valid":
        result = [r for r in structured_results if r["status"] == "Valid"]
    elif filter_type == "invalid":
        result = [r for r in structured_results if r["status"] == "Invalid"]
    else:
        result = structured_results

    return jsonify({
        "status": "success",
        "count": len(result),
        "emails": result,
        "stats": {
            "urls_processed": len(final_urls),
            "total_found": len(all_emails),
            "valid_emails": valid_count,
            "invalid_emails": invalid_count,
            "processing_time": round(time.time() - start, 2)
        },
        "message": "Extraction completed"
    })

if __name__ == "__main__":
     app.run(debug=True)