from flask import Flask, render_template, request, jsonify
import requests
import re
from bs4 import BeautifulSoup
import validators

app = Flask(__name__)

EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

def extract_emails_from_url(url):
    emails = set()
    try:
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        text = soup.get_text()
        found = re.findall(EMAIL_REGEX, text)
        emails.update(found)
    except Exception:
        pass
    return emails

def classify_emails(emails):
    valid, invalid = [], []
    for email in emails:
        if validators.email(email):
            valid.append(email)
        else:
            invalid.append(email)
    return valid, invalid

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/extract', methods=['POST'])
def extract():
    data = request.json
    urls = data.get('urls', [])
    option = data.get('filter', 'valid')

    all_emails = set()

    for url in urls:
        if not url.startswith('http'):
            url = 'https://' + url
        all_emails.update(extract_emails_from_url(url))

    valid, invalid = classify_emails(all_emails)

    if option == 'valid':
        result = valid
    elif option == 'invalid':
        result = invalid
    else:
        result = list(all_emails)

    return jsonify({
        'count': len(result),
        'emails': result
    })

if __name__ == '__main__':
    app.run(debug=True)
