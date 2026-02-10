function extractEmails() {
    const urls = document.getElementById('urls').value
        .split('\n')
        .map(u => u.trim())
        .filter(u => u);

    const filter = document.querySelector('input[name="filter"]:checked').value;

    fetch('/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, filter })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById('count').innerText = data.count;
        document.getElementById('output').innerText = data.emails.join('\n');
    });
}
