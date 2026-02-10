from flask import Flask, render_template, request, jsonify
import requests
import re
from bs4 import BeautifulSoup
import validators
from urllib.parse import urlparse
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os

app = Flask(__name__)

EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

# Cache to store results (for demo purposes)
RESULTS_CACHE = {}

def is_valid_url(url):
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except:
        return False

def extract_emails_from_url(url):
    emails = set()
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract from page text
        text = soup.get_text()
        found = re.findall(EMAIL_REGEX, text)
        emails.update(found)
        
        # Extract from mailto links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.startswith('mailto:'):
                email = href.replace('mailto:', '').split('?')[0]
                if re.match(EMAIL_REGEX, email):
                    emails.add(email)
        
        # Extract from meta tags
        for meta in soup.find_all('meta'):
            content = meta.get('content', '')
            if content and '@' in content:
                found_meta = re.findall(EMAIL_REGEX, content)
                emails.update(found_meta)
                
    except Exception as e:
        print(f"Error extracting from {url}: {e}")
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

def process_urls_parallel(urls, max_workers=5):
    all_emails = set()
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {executor.submit(extract_emails_from_url, url): url for url in urls}
        
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                emails = future.result()
                all_emails.update(emails)
            except Exception as e:
                print(f"Error processing {url}: {e}")
    
    return all_emails

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/extract', methods=['POST'])
def extract():
    data = request.json
    urls = data.get('urls', [])
    option = data.get('filter', 'valid')
    
    # Remove duplicates and empty strings
    urls = list(set([url.strip() for url in urls if url.strip()]))
    
    # Add https:// if missing and validate
    processed_urls = []
    for url in urls:
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        if is_valid_url(url):
            processed_urls.append(url)
    
    if not processed_urls:
        return jsonify({
            'count': 0,
            'emails': [],
            'message': 'No valid URLs provided',
            'status': 'error'
        })
    
    # Check cache first
    cache_key = json.dumps(sorted(processed_urls) + [option])
    if cache_key in RESULTS_CACHE:
        cached_data = RESULTS_CACHE[cache_key]
        cached_data['cached'] = True
        return jsonify(cached_data)
    
    # Process URLs in parallel for speed
    start_time = time.time()
    all_emails = process_urls_parallel(processed_urls)
    elapsed_time = time.time() - start_time
    
    valid, invalid = classify_emails(all_emails)
    
    if option == 'valid':
        result = sorted(valid)
    elif option == 'invalid':
        result = sorted(invalid)
    else:
        result = sorted(list(all_emails))
    
    response_data = {
        'count': len(result),
        'emails': result,
        'stats': {
            'urls_processed': len(processed_urls),
            'total_found': len(all_emails),
            'valid_emails': len(valid),
            'invalid_emails': len(invalid),
            'processing_time': round(elapsed_time, 2)
        },
        'message': f'Successfully processed {len(processed_urls)} URL(s)',
        'status': 'success'
    }
    
    # Cache the result
    RESULTS_CACHE[cache_key] = response_data.copy()
    
    return jsonify(response_data)

@app.route('/export', methods=['POST'])
def export():
    data = request.json
    emails = data.get('emails', [])
    format_type = data.get('format', 'txt')
    
    if format_type == 'txt':
        content = '\n'.join(emails)
        return jsonify({'content': content, 'filename': 'emails.txt'})
    elif format_type == 'csv':
        content = 'Email\n' + '\n'.join([f'"{email}"' for email in emails])
        return jsonify({'content': content, 'filename': 'emails.csv'})
    elif format_type == 'json':
        content = json.dumps({'emails': emails}, indent=2)
        return jsonify({'content': content, 'filename': 'emails.json'})
    
    return jsonify({'error': 'Invalid format'}), 400

@app.route('/clear-cache', methods=['POST'])
def clear_cache():
    RESULTS_CACHE.clear()
    return jsonify({'status': 'success', 'message': 'Cache cleared'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)