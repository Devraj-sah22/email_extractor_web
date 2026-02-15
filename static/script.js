let currentEmails = [];

function updateUrlCounter() {
    const urls = document.getElementById('urls').value
        .split('\n')
        .map(u => u.trim())
        .filter(u => u);
    document.getElementById('urlCount').innerText = urls.length;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function extractEmails() {
    const urls = document.getElementById('urls').value
        .split('\n')
        .map(u => u.trim())
        .filter(u => u);

    if (urls.length === 0) {
        showToast('Please enter at least one URL', 'error');
        return;
    }

    if (urls.length > 10) {
        showToast('Maximum 10 URLs allowed for optimal performance', 'warning');
        return;
    }

    const filter = document.querySelector('input[name="filter"]:checked').value;
    const deepScan = document.getElementById('deepScan')?.checked || false;

    showLoading(true);

    fetch('/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            urls,
            filter,
            scan_mode: deepScan ? 'deep' : 'fast'
        })
    })
        .then(async res => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Error extracting emails');
            return data;
        })
        .then(data => {
            if (data.status === 'error') {
                throw new Error(data.message);
            }

            currentEmails = data.emails || [];

            document.getElementById('count').innerText = data.count || 0;
            const tbody = document.querySelector('#resultTable tbody');
            tbody.innerHTML = '';

            data.emails.forEach(item => {
                const row = document.createElement('tr');

                row.innerHTML = `
        <td>${item.email}</td>
        <td class="${item.status === 'Valid' ? 'valid' : 'invalid'}">${item.status}</td>
        <td>${item.domain}</td>
        <td>${item.source}</td>
        <td>
            <button onclick="navigator.clipboard.writeText('${item.email}')">
                Copy
            </button>
        </td>
    `;

                tbody.appendChild(row);
            });


            const stats = data.stats || {};
            document.getElementById('stats').innerHTML = `
            Mode: <b>${stats.scan_mode || (deepScan ? 'deep' : 'fast')}</b> |
            Processed ${stats.urls_processed || urls.length} URL(s) in ${stats.processing_time || '?'}s |
            Valid: ${stats.valid_emails || 0} | Invalid: ${stats.invalid_emails || 0}
        `;

            document.getElementById('exportButtons').style.display =
                currentEmails.length > 0 ? 'flex' : 'none';

            document.getElementById('placeholder').style.display =
                currentEmails.length > 0 ? 'none' : 'block';

            showToast(data.message || 'Extraction completed');
        })
        .catch(error => {
            showToast(error.message || 'Error extracting emails', 'error');
            console.error('Error:', error);
        })
        .finally(() => {
            showLoading(false);
        });
}


function exportEmails(format) {
    if (currentEmails.length === 0) {
        showToast('No emails to export', 'warning');
        return;
    }

    fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: currentEmails, format })
    })
        .then(res => res.json())
        .then(data => {
            const blob = new Blob([data.content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast(`Exported as ${format.toUpperCase()}`);
        })
        .catch(error => {
            showToast('Error exporting emails', 'error');
            console.error('Error:', error);
        });
}

function copyToClipboard() {
    if (currentEmails.length === 0) {
        showToast('No emails to copy', 'warning');
        return;
    }

    navigator.clipboard.writeText(currentEmails.join('\n'))
        .then(() => showToast('Copied to clipboard!'))
        .catch(() => showToast('Failed to copy', 'error'));
}

function clearAll() {
    document.getElementById('urls').value = '';
    document.getElementById('output').innerText = '';
    document.getElementById('count').innerText = '0';
    document.getElementById('urlCount').innerText = '0';
    document.getElementById('stats').innerHTML = '';
    document.getElementById('exportButtons').style.display = 'none';
    document.getElementById('placeholder').style.display = 'block';
    currentEmails = [];
    showToast('Cleared all content');
}

// ===============================
// Email Table Search Function
// ===============================

function filterEmailTable() {
    const input = document.getElementById("emailSearch");
    if (!input) return;

    const filter = input.value.toLowerCase();
    const table = document.getElementById("resultTable");
    if (!table) return;

    const rows = table.querySelectorAll("tbody tr");

    rows.forEach(row => {
        const email = row.cells[0]?.innerText.toLowerCase() || "";
        const domain = row.cells[2]?.innerText.toLowerCase() || "";

        if (email.includes(filter) || domain.includes(filter)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}


// Initialize
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('urls').addEventListener('input', updateUrlCounter);
    updateUrlCounter();

    // Add example URLs on click if empty
    document.getElementById('urls').addEventListener('click', function (e) {
        if (!this.value.trim()) {
            this.value = 'https://example.com\n';
        }
        updateUrlCounter();
    });
});