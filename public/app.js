document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation Logic ---
    const tabs = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update tabs
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update sections
            const targetId = tab.dataset.tab;
            sections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === targetId) {
                    sec.classList.add('active');
                }
            });
        });
    });

    // --- Configuration Fetch ---
    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            const modelSelect = document.getElementById('model-select');
            if (modelSelect && config.aiModel) {
                // Add current model if it's not in the list
                const exists = Array.from(modelSelect.options).some(opt => opt.value === config.aiModel);
                if (!exists) {
                    const opt = document.createElement('option');
                    opt.value = config.aiModel;
                    opt.textContent = config.aiModel;
                    modelSelect.add(opt);
                }
                modelSelect.value = config.aiModel;
            }
        })
        .catch(err => console.error('Failed to fetch config', err));


    // --- File Upload Helpers ---
    function setupDragAndDrop(dropzoneId, fileInputId, handleFile) {
        const dropzone = document.getElementById(dropzoneId);
        const input = document.getElementById(fileInputId);

        dropzone.addEventListener('click', () => input.click());

        input.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
    }

    async function sendRequest(url, formData, resultsDivId) {
        const resultsDiv = document.getElementById(resultsDivId);
        const spinner = resultsDiv.querySelector('.loading-spinner');
        const content = resultsDiv.querySelector('.markdown-content');

        // Reset UI
        resultsDiv.classList.remove('hidden');
        spinner.classList.remove('hidden');
        content.innerHTML = '';

        try {
            const res = await fetch(url, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            spinner.classList.add('hidden');

            if (data.success && data.analysis) {
                // Parse Markdown using marked (loaded from CDN)
                // Remove the extra JSON framing if present in text
                let finalText = data.analysis;

                // If the backend returns a JSON string, try to parse it to get clean text
                try {
                    const parsed = JSON.parse(finalText);
                    if (parsed.success && parsed.text) finalText = parsed.text; // Handling older tool behavior
                } catch (e) {
                    // It's likely just plain text/markdown
                }

                content.innerHTML = marked.parse(finalText);
            } else {
                content.innerHTML = `<div style="color: var(--danger)">Error: ${data.error || 'Unknown error occurred'}</div>`;
            }
        } catch (err) {
            console.error('Request failed:', err);
            spinner.classList.add('hidden');
            content.innerHTML = `<div style="color: var(--danger)">Network Error: ${err.message}</div>`;
        }
    }

    // --- Contract Review Logic ---
    setupDragAndDrop('review-dropzone', 'review-file', (file) => {
        const side = document.getElementById('review-side').value;
        const focus = document.getElementById('review-focus').value;
        const model = document.getElementById('model-select').value;
        const replyInOriginalLanguage = document.getElementById('reply-language-check').checked;
        const prompt = document.getElementById('review-prompt')?.value || '';

        const formData = new FormData();
        formData.append('document', file);
        formData.append('side', side);
        formData.append('focus', focus);
        formData.append('model', model);
        formData.append('replyInOriginalLanguage', replyInOriginalLanguage);
        if (prompt.trim()) formData.append('prompt', prompt);

        sendRequest('/api/review', formData, 'review-results');
    });

    // --- NDA Triage Logic ---
    setupDragAndDrop('triage-dropzone', 'triage-file', (file) => {
        const model = document.getElementById('model-select').value;
        const replyInOriginalLanguage = document.getElementById('reply-language-check').checked;
        const prompt = document.getElementById('triage-prompt')?.value || '';
        const formData = new FormData();
        formData.append('document', file);
        formData.append('model', model);
        formData.append('replyInOriginalLanguage', replyInOriginalLanguage);
        if (prompt.trim()) formData.append('prompt', prompt);

        sendRequest('/api/triage', formData, 'triage-results');
    });

    // --- Compliance Logic ---
    setupDragAndDrop('compliance-dropzone', 'compliance-file', (file) => {
        const model = document.getElementById('model-select').value;
        const replyInOriginalLanguage = document.getElementById('reply-language-check').checked;
        const prompt = document.getElementById('compliance-prompt')?.value || '';
        const formData = new FormData();
        formData.append('document', file);
        formData.append('model', model);
        formData.append('replyInOriginalLanguage', replyInOriginalLanguage);
        if (prompt.trim()) formData.append('prompt', prompt);

        sendRequest('/api/compliance', formData, 'compliance-results');
    });

    // --- Risk Assessment Logic ---
    setupDragAndDrop('risk-dropzone', 'risk-file', (file) => {
        const model = document.getElementById('model-select').value;
        const replyInOriginalLanguage = document.getElementById('reply-language-check').checked;
        const prompt = document.getElementById('risk-prompt')?.value || '';
        const formData = new FormData();
        formData.append('document', file);
        formData.append('model', model);
        formData.append('replyInOriginalLanguage', replyInOriginalLanguage);
        if (prompt.trim()) formData.append('prompt', prompt);

        sendRequest('/api/risk', formData, 'risk-results');
    });

    // --- Meeting Brief Logic ---
    setupDragAndDrop('meeting-dropzone', 'meeting-file', (file) => {
        const model = document.getElementById('model-select').value;
        const replyInOriginalLanguage = document.getElementById('reply-language-check').checked;
        const prompt = document.getElementById('meeting-prompt')?.value || '';
        const formData = new FormData();
        formData.append('document', file);
        formData.append('model', model);
        formData.append('replyInOriginalLanguage', replyInOriginalLanguage);
        if (prompt.trim()) formData.append('prompt', prompt);

        sendRequest('/api/meeting', formData, 'meeting-results');
    });

    // --- Legal Brief Logic ---
    document.getElementById('generate-brief-btn').addEventListener('click', () => {
        const type = document.getElementById('brief-type').value;
        const query = document.getElementById('brief-query').value;

        if (!query.trim()) {
            alert('Please enter a query');
            return;
        }

        const resultsDivId = 'brief-results';
        const resultsDiv = document.getElementById(resultsDivId);
        const spinner = resultsDiv.querySelector('.loading-spinner');
        const content = resultsDiv.querySelector('.markdown-content');

        resultsDiv.classList.remove('hidden');
        spinner.classList.remove('hidden');
        content.innerHTML = '';

        const model = document.getElementById('model-select').value;
        const replyInOriginalLanguage = document.getElementById('reply-language-check').checked;
        fetch('/api/brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, query, model, replyInOriginalLanguage })
        })
            .then(res => res.json())
            .then(data => {
                spinner.classList.add('hidden');
                if (data.success && data.analysis) {
                    content.innerHTML = marked.parse(data.analysis);
                } else {
                    content.innerHTML = `<div style="color: var(--danger)">Error: ${data.error || 'Unknown error'}</div>`;
                }
            })
            .catch(err => {
                console.error('Brief generation failed:', err);
                spinner.classList.add('hidden');
                content.innerHTML = `<div style="color: var(--danger)">Network Error: ${err.message}</div>`;
            });
    });
});
