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
    
    showLoading(true);
    
    fetch('/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, filter })
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
        
        currentEmails = data.emails;
        
        document.getElementById('count').innerText = data.count;
        document.getElementById('output').innerText = currentEmails.join('\n');
        
        // Update stats
        const stats = data.stats || {};
        document.getElementById('stats').innerHTML = `
            Processed ${stats.urls_processed || urls.length} URL(s) in ${stats.processing_time || '?'}s |
            Valid: ${stats.valid_emails || 0} | Invalid: ${stats.invalid_emails || 0}
        `;
        
        // Show export buttons if we have results
        document.getElementById('exportButtons').style.display = 
            currentEmails.length > 0 ? 'flex' : 'none';
        
        // Hide placeholder
        document.getElementById('placeholder').style.display = 
            currentEmails.length > 0 ? 'none' : 'block';
        
        showToast(data.message + (data.cached ? ' (cached)' : ''));
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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('urls').addEventListener('input', updateUrlCounter);
    updateUrlCounter();
    
    // Add example URLs on click if empty
    document.getElementById('urls').addEventListener('click', function(e) {
        if (!this.value.trim()) {
            this.value = 'https://example.com\n';
        }
        updateUrlCounter();
    });
});