let currentEmails = [];
/* ===============================
   NEW: Pagination State (ADDED)
   =============================== */
let filteredEmails = [];
let currentPage = 1;
let rowsPerPage = 20;


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
        <td>
            <input type="checkbox" class="rowCheckbox">
        </td>
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
            /* ===== NEW: Pagination initialization (ADDED) ===== */
            filteredEmails = [...currentEmails];
            currentPage = 1;
            renderPaginatedTable();

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
/* ===============================
   NEW: Pagination Render Logic
   =============================== */
function renderPaginatedTable() {
    const tbody = document.querySelector('#resultTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredEmails.slice(start, end);

    pageData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="rowCheckbox"></td>
            <td>${item.email}</td>
            <td class="${item.status === 'Valid' ? 'valid' : 'invalid'}">${item.status}</td>
            <td>${item.domain}</td>
            <td>${item.source}</td>
            <td>
                <button onclick="navigator.clipboard.writeText('${item.email}')">Copy</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    updatePaginationUI();
}

function updatePaginationUI() {
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('pageInfo');
    if (!pagination || !pageInfo) return;

    const totalPages = Math.ceil(filteredEmails.length / rowsPerPage) || 1;
    pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
    pagination.style.display = filteredEmails.length ? 'flex' : 'none';
}

function nextPage() {
    const totalPages = Math.ceil(filteredEmails.length / rowsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderPaginatedTable();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderPaginatedTable();
    }
}

function goToFirstPage() {
    currentPage = 1;
    renderPaginatedTable();
}

function goToLastPage() {
    currentPage = Math.ceil(filteredEmails.length / rowsPerPage);
    renderPaginatedTable();
}


function exportEmails(format) {
    const rows = document.querySelectorAll("#resultTable tbody tr");
    const validEmails = [];
    const invalidEmails = [];

    const anySelected = Array.from(rows).some(
        row => row.querySelector(".rowCheckbox")?.checked
    );

    rows.forEach(row => {
        const checkbox = row.querySelector(".rowCheckbox");
        if (!checkbox) return;

        if (anySelected && !checkbox.checked) return;

        const email = row.cells[1].innerText.trim();
        const status = row.cells[2].innerText.trim();

        if (status === "Valid") {
            validEmails.push(email);
        } else {
            invalidEmails.push(email);
        }
    });

    const emails = [...validEmails, ...invalidEmails];

    if (emails.length === 0) {
        showToast("No emails to export", "warning");
        return;
    }

    let content = "";
    let mime = "text/plain";
    let filename = `emails.${format}`;

    if (format === "txt") {
        content = emails.join("\n");
    }
    else if (format === "csv") {
        content = "Email\n" + emails.join("\n");
    }
    else if (format === "json") {
        content = JSON.stringify(emails, null, 2);
        mime = "application/json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast(`Exported ${emails.length} email(s)`);
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
    document.getElementById('pagination').style.display = 'none';
    currentEmails = [];
    filteredEmails = [];
    currentPage = 1;
    
    showToast('Cleared all content');
}

// ===============================
// Email Table Search Function
// ===============================

function filterEmailTable() {
    const input = document.getElementById("emailSearch");
    if (!input) return;

    /*const filter = input.value.toLowerCase();
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
    });*/
    const query = input.value.toLowerCase();
    filteredEmails = currentEmails.filter(item =>
        item.email.toLowerCase().includes(query) ||
        item.domain.toLowerCase().includes(query)
    );

    currentPage = 1;
    renderPaginatedTable();
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
    /* ===== NEW: Rows per page listener ===== */
    document.getElementById('rowsPerPage')?.addEventListener('change', function () {
        rowsPerPage = parseInt(this.value);
        currentPage = 1;
        renderPaginatedTable();
    });
    /*
    // ===============================
    // DYNAMIC TABLE SORT (WORKING)
    // ===============================
    let sortState = {
        column: -1,
        asc: true
    };

    // Event delegation: works even after table updates
    document.addEventListener("click", function (e) {
        const th = e.target.closest("#resultTable th");
        if (!th) return;

        const headers = Array.from(th.parentElement.children);
        const colIndex = headers.indexOf(th);

        // Ignore Actions column
        if (colIndex === headers.length - 1) return;

        sortTableByColumn(colIndex);
    });

    function sortTableByColumn(colIndex) {
        const table = document.getElementById("resultTable");
        if (!table || !table.tBodies.length) return;

        const tbody = table.tBodies[0];
        const rows = Array.from(tbody.rows);

        // Toggle sort direction
        if (sortState.column === colIndex) {
            sortState.asc = !sortState.asc;
        } else {
            sortState.column = colIndex;
            sortState.asc = true;
        }

        rows.sort((rowA, rowB) => {
            const a = rowA.cells[colIndex]?.innerText.trim().toLowerCase() || "";
            const b = rowB.cells[colIndex]?.innerText.trim().toLowerCase() || "";

            return sortState.asc
                ? a.localeCompare(b)
                : b.localeCompare(a);
        });

        rows.forEach(row => tbody.appendChild(row));
        updateSortIcons(colIndex);
    }

    function updateSortIcons(colIndex) {
        const headers = document.querySelectorAll("#resultTable th");

        headers.forEach((th, i) => {
            th.classList.remove("asc", "desc");
            if (i === colIndex) {
                th.classList.add(sortState.asc ? "asc" : "desc");
            }
        });
    }*/
    // ===============================
    // DYNAMIC TABLE SORT (WORKING)
    // ===============================
    let sortState = {
        column: -1,
        asc: true
    };

    document.addEventListener("click", function (e) {
        const th = e.target.closest("#resultTable th");
        if (!th) return;

        const headers = Array.from(th.parentElement.children);
        const colIndex = headers.indexOf(th);
        if (colIndex === headers.length - 1) return;

        sortTableByColumn(colIndex);
    });

    function sortTableByColumn(colIndex) {
        if (!filteredEmails.length) return;

        if (sortState.column === colIndex) {
            sortState.asc = !sortState.asc;
        } else {
            sortState.column = colIndex;
            sortState.asc = true;
        }

        filteredEmails.sort((a, b) => {
            const A = Object.values(a)[colIndex]?.toString().toLowerCase() || "";
            const B = Object.values(b)[colIndex]?.toString().toLowerCase() || "";
            return sortState.asc ? A.localeCompare(B) : B.localeCompare(A);
        });

        currentPage = 1;
        renderPaginatedTable();
        updateSortIcons(colIndex);
    }

    function updateSortIcons(colIndex) {
        const headers = document.querySelectorAll("#resultTable th");
        headers.forEach((th, i) => {
            th.classList.remove("asc", "desc");
            if (i === colIndex) {
                th.classList.add(sortState.asc ? "asc" : "desc");
            }
        });
    }
    /*// ===============================
    // Checkbox Select / Deselect All
    // ===============================
    document.addEventListener("change", function (e) {
        // Select all checkbox
        if (e.target.id === "selectAll") {
            const checked = e.target.checked;
            document.querySelectorAll(".rowCheckbox").forEach(cb => {
                cb.checked = checked;
            });
        }

        // Update selectAll when individual checkbox changes
        if (e.target.classList.contains("rowCheckbox")) {
            const all = document.querySelectorAll(".rowCheckbox");
            const checked = document.querySelectorAll(".rowCheckbox:checked");

            const selectAll = document.getElementById("selectAll");
            if (selectAll) {
                selectAll.checked = all.length === checked.length;
            }
        }
    });*/
    // ===============================
    // Checkbox Select / Deselect All
    // ===============================
    document.addEventListener("change", function (e) {
        if (e.target.id === "selectAll") {
            document.querySelectorAll(".rowCheckbox").forEach(cb => {
                cb.checked = e.target.checked;
            });
        }

        if (e.target.classList.contains("rowCheckbox")) {
            const all = document.querySelectorAll(".rowCheckbox");
            const checked = document.querySelectorAll(".rowCheckbox:checked");
            const selectAll = document.getElementById("selectAll");
            if (selectAll) selectAll.checked = all.length === checked.length;
        }
    });

    // ===============================
    // Collect Emails for Export
    // ===============================
    function getEmailsForExport() {
        const rows = document.querySelectorAll("#resultTable tbody tr");
        const selectedRows = [];
        const validEmails = [];
        const invalidEmails = [];

        // Check if any checkbox is selected
        const anySelected = Array.from(rows).some(
            row => row.querySelector(".rowCheckbox")?.checked
        );

        rows.forEach(row => {
            const checkbox = row.querySelector(".rowCheckbox");
            if (!checkbox) return;

            // If some are selected, ignore unchecked rows
            if (anySelected && !checkbox.checked) return;

            const email = row.cells[1].innerText.trim();   // Email Address
            const status = row.cells[2].innerText.trim();  // Status

            if (status === "Valid") {
                validEmails.push(email);
            } else {
                invalidEmails.push(email);
            }
        });

        // Valid first, Invalid last
        return [...validEmails, ...invalidEmails];
    }


});