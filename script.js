// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let resumeData = {
    personal: { name:'', email:'', phone:'', location:'', title:'', linkedin:'', github:'', website:'', twitter:'' },
    summary: '',
    experience: [],
    education: [],
    skills: '',
    projects: [],
    customSections: [],
    settings: { theme:'theme-modern', font:'font-inter', headingFont:'font-inter', primaryColor:'#6366f1', textColor:'#111827', fontSize:10, headingSize:16, sidebarSide: 'left', pageSize: 'a4' },
    photo: null,
    iconSet: 'emoji'
};

let zoomLevel = 100;
let linkedInPending = {};
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let activeProfileId = null;

// History Management
let history = [];
let historyIndex = -1;
let isApplyingHistory = false;
const MAX_HISTORY = 50;

function pushToHistory() {
    if (isApplyingHistory) return;
    
    const snapshot = JSON.stringify({
        ...resumeData,
        experience: getDynamicItems('experience'),
        education:  getDynamicItems('education'),
        projects:   getDynamicItems('projects'),
        customSections: getCustomSections()
    });

    // Only push if different from last
    if (historyIndex >= 0 && history[historyIndex] === snapshot) return;

    // Remove future states if we are in the middle of history
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }

    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    else historyIndex++;
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        applyHistoryState(history[historyIndex]);
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        applyHistoryState(history[historyIndex]);
    }
}

function applyHistoryState(jsonStr) {
    isApplyingHistory = true;
    try {
        const state = JSON.parse(jsonStr);
        mergeResumeData(state, true); // true = silent (no alert)
    } catch(e) { console.error("Undo error:", e); }
    isApplyingHistory = false;
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupEventListeners();
    setupMobile();
    loadProfileList();
    
    // Load Autosave if it exists, otherwise sample data
    const saved = localStorage.getItem('resumeAutosave');
    if (saved) {
        try {
            mergeResumeData(JSON.parse(saved));
        } catch(e) {
            loadSampleData();
        }
    } else {
        loadSampleData();
    }
    updatePreview();
});

// ═══════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const sec = item.getAttribute('data-section');
            const label = item.querySelector('.nav-label').textContent;
            
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
            const targetSec = document.getElementById('form-' + sec);
            if (targetSec) targetSec.classList.add('active');
            
            document.title = `${label} | AI Resume Architect`;

            if (window.innerWidth <= 640) {
                document.getElementById('sidebar').classList.remove('mobile-open');
            }
        });
    });
}

// ═══════════════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════════════
function setupEventListeners() {
    // Sync simple inputs
    document.querySelectorAll('.sync-input').forEach(inp => {
        inp.addEventListener('input', e => {
            const id = e.target.id.replace('input-', '');
            const personalKeys = ['name','email','phone','location','title','linkedin','github','website','twitter'];
            if (personalKeys.includes(id)) resumeData.personal[id] = e.target.value;
            else if (id === 'summary') resumeData.summary = e.target.value;
            else if (id === 'skills')  resumeData.skills = e.target.value;
            else if (id === 'font')    { resumeData.settings.font = e.target.value; }
            else if (id === 'heading-font') { resumeData.settings.headingFont = e.target.value; }
            updatePreview();
        });
    });

    // Theme cards
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            resumeData.settings.theme = card.getAttribute('data-theme');
            updatePreview();
        });
    });

    // Primary color
    document.getElementById('setting-color').addEventListener('input', e => {
        resumeData.settings.primaryColor = e.target.value;
        updatePreview();
    });

    // Text color
    document.getElementById('setting-text-color').addEventListener('input', e => {
        resumeData.settings.textColor = e.target.value;
        updatePreview();
    });

    // Photo upload
    document.getElementById('photo-input').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            resumeData.photo = ev.target.result;
            const prev = document.getElementById('photo-preview');
            prev.innerHTML = `<img src="${ev.target.result}" alt="Profile photo">`;
            document.getElementById('remove-photo-btn').style.display = 'inline-block';
            updatePreview();
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('photo-preview').addEventListener('click', () => {
        document.getElementById('photo-input').click();
    });

    // Upload resume JSON or PDF
    document.getElementById('upload-resume-btn').addEventListener('click', () => {
        document.getElementById('upload-resume-input').click();
    });
    document.getElementById('upload-resume-input').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.type === 'application/pdf') {
            await extractTextFromPDF(file);
        } else {
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const data = JSON.parse(ev.target.result);
                    mergeResumeData(data);
                } catch(err) {
                    alert('Invalid JSON file. Please upload a resume exported from this app.');
                }
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    });

    // Download menu toggle
    document.getElementById('download-trigger').addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('download-menu').classList.toggle('open');
    });
    document.addEventListener('click', () => {
        document.getElementById('download-menu').classList.remove('open');
    });

    // Share
    document.getElementById('share-resume').addEventListener('click', shareResume);

    // Zoom
    document.getElementById('zoom-in-btn').addEventListener('click',  () => setZoom(zoomLevel + 10));
    document.getElementById('zoom-out-btn').addEventListener('click', () => setZoom(zoomLevel - 10));

    // Mobile preview toggle
    document.getElementById('toggle-preview-mode').addEventListener('click', () => {
        document.getElementById('preview-area').classList.toggle('mobile-view');
    });

    // LinkedIn autofill
    document.getElementById('linkedin-autofill-btn').addEventListener('click', triggerLinkedInAutofill);

    // Keyboard Shortcuts
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    });
}

// ═════════════════════════════════════════════════════
//  MOBILE
// ═════════════════════════════════════════════════════
function setupMobile() {
    const menuBtn = document.getElementById('mobile-menu-toggle');
    const prevBtn = document.getElementById('mobile-preview-toggle');
    const sidebar = document.getElementById('sidebar');
    const preview = document.getElementById('preview-area');

    if (menuBtn) menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        preview.classList.remove('mobile-visible');
    });
    if (prevBtn) prevBtn.addEventListener('click', () => {
        preview.classList.toggle('mobile-visible');
        sidebar.classList.remove('mobile-open');
    });
}

// ═════════════════════════════════════════════════════
//  SIDEBAR POSITION
// ═════════════════════════════════════════════════════
function setSidebarSide(side) {
    resumeData.settings.sidebarSide = side;
    document.getElementById('side-left').classList.toggle('active', side === 'left');
    document.getElementById('side-right').classList.toggle('active', side === 'right');
    updatePreview();
}

// ═════════════════════════════════════════════════════
//  ZOOM
// ═════════════════════════════════════════════════════
function setZoom(level) {
    zoomLevel = Math.max(40, Math.min(150, level));
    document.getElementById('resume-preview').style.transform = `scale(${zoomLevel/100})`;
    document.getElementById('zoom-level').textContent = zoomLevel + '%';
}

// ═════════════════════════════════════════════════════
//  FONT SIZE
// ═════════════════════════════════════════════════════
function changeFontSize(delta) {
    resumeData.settings.fontSize = Math.max(7, Math.min(14, resumeData.settings.fontSize + delta));
    document.getElementById('font-size-display').textContent = resumeData.settings.fontSize + 'pt';
    updatePreview();
}

function changeHeadingSize(delta) {
    resumeData.settings.headingSize = Math.max(10, Math.min(36, (resumeData.settings.headingSize || 16) + delta));
    document.getElementById('heading-size-display').textContent = resumeData.settings.headingSize + 'pt';
    updatePreview();
}

// ═════════════════════════════════════════════════════
//  COLOR HELPERS
// ═════════════════════════════════════════════════════
function setColor(hex) {
    resumeData.settings.primaryColor = hex;
    document.getElementById('setting-color').value = hex;
    updatePreview();
}
function setTextColor(hex) {
    resumeData.settings.textColor = hex;
    document.getElementById('setting-text-color').value = hex;
    updatePreview();
}

// ═════════════════════════════════════════════════════
//  ICON SET
// ═════════════════════════════════════════════════════
function setIconSet(set, btn) {
    resumeData.iconSet = set;
    document.querySelectorAll('.icon-set-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updatePreview();
}

function getIcons() {
    const sets = {
        emoji:   { email:'📧', phone:'📱', location:'📍', linkedin:'🔗', github:'💻', website:'🌐', twitter:'🐦' },
        text:    { email:'Email:', phone:'Phone:', location:'Location:', linkedin:'LinkedIn:', github:'GitHub:', website:'Website:', twitter:'Twitter:' },
        minimal: { email:'·', phone:'·', location:'·', linkedin:'·', github:'·', website:'·', twitter:'·' }
    };
    return sets[resumeData.iconSet] || sets.emoji;
}

// ═════════════════════════════════════════════════════
//  DYNAMIC ITEMS
// ═════════════════════════════════════════════════════
function addItem(type) {
    const list = document.getElementById(type + '-list');
    const tmpl = document.getElementById('tmpl-' + type).content.cloneNode(true);
    const id = Date.now().toString();
    tmpl.querySelector('.list-item').setAttribute('data-id', id);
    const newChild = tmpl.querySelector('.list-item');
    list.appendChild(tmpl);
    updatePreview();
    return newChild;
}

function removeItem(btn) {
    btn.closest('.list-item').remove();
    updatePreview();
}

function removePhoto() {
    resumeData.photo = null;
    document.getElementById('photo-preview').innerHTML = '<span>📷</span><small>Click to upload photo</small>';
    document.getElementById('remove-photo-btn').style.display = 'none';
    updatePreview();
}

function getDynamicItems(type) {
    const items = [];
    document.querySelectorAll('#' + type + '-list .list-item').forEach(el => {
        const item = {};
        el.querySelectorAll('input, textarea').forEach(inp => {
            const cls = Array.from(inp.classList).find(c => c.startsWith('item-'));
            if (cls) item[cls.replace('item-','')] = inp.value;
        });
        items.push(item);
    });
    return items;
}

// ═════════════════════════════════════════════════════
//  CUSTOM SECTIONS
// ═════════════════════════════════════════════════════
function addCustomSection(side = 'right') {
    const editorArea = document.getElementById('editor-area');
    const id = 'cs-' + Date.now();
    
    const sec = document.createElement('div');
    sec.className = 'form-section form-custom-section-instance';
    sec.id = 'form-' + id;
    sec.setAttribute('data-cid', id);
    sec.innerHTML = `
      <div class="section-header" style="flex-wrap: wrap; gap: 0.5rem; border-bottom: none">
        <input type="text" class="cs-title" placeholder="New Section (e.g. Certifications)" oninput="updatePreview(); refreshSidebarNav();" value="" style="font-size:1.5rem; font-weight:700; background:transparent; border:none; color:var(--text-main); border-bottom:1px dashed var(--border); width:60%; flex: 1; min-width: 200px; outline:none">
        <div style="display:flex; gap:0.5rem; align-items: center;">
            <select class="cs-side sync-input" onchange="updatePreview()" style="padding:0.4rem; border-radius:4px; font-size:0.8rem; background: var(--sidebar-bg); color: var(--text-main); border: 1px solid var(--border);">
                <option value="right" ${side==='right'?'selected':''}>Right Side (Main)</option>
                <option value="left" ${side==='left'?'selected':''}>Left Side (Sidebar)</option>
            </select>
            <button class="btn-remove" onclick="removeCustomSection('${id}')" title="Delete Section">×</button>
        </div>
      </div>
      <div class="input-group">
        <label>Section Subtitle / Description</label>
        <input type="text" class="cs-desc" placeholder="Short description (optional)" oninput="updatePreview()">
      </div>
      <div class="cs-entries dynamic-list"></div>
      <button class="btn-add" style="margin-top:1rem" onclick="addCustomEntry(this)">+ Add Entry to this Section</button>
    `;
    
    // Insert before themes & style
    editorArea.insertBefore(sec, document.getElementById('form-settings'));
    
    refreshSidebarNav();
    updatePreview();
    
    // Auto-switch to newly created section
        setTimeout(() => {
        const expRaw = expMatch || "";
        const eduRaw = eduMatch || "";
        
        const expEntries = splitEntries(expRaw).map(e => {
            const lines = e.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
            return parseExperienceEntry(lines);
        });

        const eduEntries = splitEntries(eduRaw).map(e => {
            const lines = e.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
            return parseEducationEntry(lines);
        });

        linkedInPending = {
            name:     nameCandidate,
            title:    titleCandidate || 'Professional',
            location: text.match(/(?:[A-Z][a-z]+(?: [A-Z][a-z]+)*, [A-Z]{2})|(?:New York|San Francisco|London|Mumbai|Remote|CA|NY|TX|Dubai|Singapore|Berlin|USA|India|UK|UAE|Paris|Tokyo|Toronto)/i)?.[0] || '',
            email:    emailMatch?.[0] || '',
            phone:    phoneMatch?.[1] || '',
            linkedin: linkedinMatch ? linkedinMatch[0] : '',
            website:  websiteMatch ? websiteMatch[0] : '',
            summary:  (summaryMatch || "").replace(/\n\s*\n/g, '\n').slice(0, 800),
            skills:   skillsMatch || "",
            experience_entries: expEntries,
            education_entries: eduEntries
        };
        showLinkedInModal();
        status.textContent = '✓ Analysis complete. Please review the changes in the popup.';
        status.className = 'linkedin-status success';
    }, 1000);
}

function showLinkedInModal() {
    const modal = document.getElementById("linkedin-modal");
    const body  = document.getElementById("linkedin-modal-body");
    const personalFields = ["name","title","location","email","linkedin","summary", "skills"];
    const labels = { name:"Full Name", title:"Job Title", location:"Location", email:"Email", linkedin:"LinkedIn URL", summary:"Summary", skills:"Skills" };

    let html = `
        <div class="compare-intro">
            <p>📋 <b>Granular Comparison</b>: Review and edit individual entries below. Check the boxes to apply specific details.</p>
        </div>
        <div class="compare-list">`;

    // 1. Personal & Text Fields
    personalFields.forEach(f => {
        let cur = (f === "summary" || f === "skills") ? (resumeData[f] || "") : (resumeData.personal[f] || "");
        let nw = linkedInPending[f] || "";
        if (!nw && !cur) return;
        
        const changed = nw && nw !== cur;
        html += `
        <div class="compare-section ${changed ? "changed" : ""}">
            <div class="compare-header">
                <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer">
                    <input type="checkbox" class="compare-check" data-field="${f}" ${nw ? "checked" : ""}>
                    <span class="compare-label">${labels[f]}</span>
                </label>
            </div>
            <div class="compare-grid">
                <div class="compare-col current">
                    <div class="col-label">Current</div>
                    <div class="col-content">${cur || "<small>Empty</small>"}</div>
                </div>
                <div class="compare-col new">
                    <div class="col-label">Extracted (Editable)</div>
                    <textarea class="compare-edit-input" data-field="${f}">${nw}</textarea>
                </div>
            </div>
        </div>`;
    });

    // 2. Experience Entries
    if (linkedInPending.experience_entries && linkedInPending.experience_entries.length > 0) {
        html += `<div class="compare-group-title">Work Experience Entries</div>`;
        linkedInPending.experience_entries.forEach((ent, idx) => {
            html += `
            <div class="compare-entry-card changed">
                <div class="compare-header">
                    <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
                        <input type="checkbox" class="entry-check-exp" checked data-idx="${idx}">
                        <b>Entry ${idx + 1}: ${ent.company}</b>
                    </label>
                </div>
                <div class="entry-edit-grid">
                    <div class="input-group">
                        <label>Company</label>
                        <input type="text" class="entry-val-company" value="${ent.company}">
                    </div>
                    <div class="input-group">
                        <label>Title</label>
                        <input type="text" class="entry-val-title" value="${ent.position}">
                    </div>
                    <div class="input-group">
                        <label>Duration</label>
                        <input type="text" class="entry-val-date" value="${ent.date}">
                    </div>
                    <div class="input-group" style="grid-column: span 2">
                        <label>Description</label>
                        <textarea class="entry-val-desc" rows="3">${ent.desc}</textarea>
                    </div>
                </div>
            </div>`;
        });
    }

    // 3. Education Entries
    if (linkedInPending.education_entries && linkedInPending.education_entries.length > 0) {
        html += `<div class="compare-group-title">Education Entries</div>`;
        linkedInPending.education_entries.forEach((ent, idx) => {
            html += `
            <div class="compare-entry-card changed">
                <div class="compare-header">
                    <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
                        <input type="checkbox" class="entry-check-edu" checked data-idx="${idx}">
                        <b>Entry ${idx + 1}: ${ent.school}</b>
                    </label>
                </div>
                <div class="entry-edit-grid">
                    <div class="input-group">
                        <label>School</label>
                        <input type="text" class="entry-val-school" value="${ent.school}">
                    </div>
                    <div class="input-group">
                        <label>Degree</label>
                        <input type="text" class="entry-val-degree" value="${ent.degree}">
                    </div>
                    <div class="input-group">
                        <label>Year</label>
                        <input type="text" class="entry-val-date" value="${ent.date}">
                    </div>
                    <div class="input-group" style="grid-column: span 2">
                        <label>Details</label>
                        <textarea class="entry-val-desc" rows="2">${ent.desc}</textarea>
                    </div>
                </div>
            </div>`;
        });
    }

    html += `</div>`;
    body.innerHTML = html;
    modal.style.display = "flex";
}

function toggleAllCompareChecks(state) {
    document.querySelectorAll('.compare-check').forEach(cb => cb.checked = state);
}

function clearResumeSection(field) {
    if (field === 'summary') {
        resumeData.summary = '';
        const el = document.getElementById('input-summary');
        if (el) el.value = '';
    } else if (field === 'skills') {
        resumeData.skills = '';
        const el = document.getElementById('input-skills');
        if (el) el.value = '';
    } else if (field === 'experience_raw') {
        resumeData.experience = [];
        document.getElementById('experience-list').innerHTML = '';
    } else if (field === 'education_raw') {
        resumeData.education = [];
        document.getElementById('education-list').innerHTML = '';
    } else if (resumeData.personal.hasOwnProperty(field)) {
        resumeData.personal[field] = '';
        const el = document.getElementById('input-' + field);
        if (el) el.value = '';
    }
    const curEl = document.getElementById('cur-' + field);
    if (curEl) curEl.innerHTML = '<span class="empty-val">Cleared \u2713</span>';
    updatePreview();
}

function applyLinkedInData() {
    const sections = document.querySelectorAll('.compare-section');
    sections.forEach(sec => {
        const checkbox = sec.querySelector('.compare-check');
        if (!checkbox || !checkbox.checked) return;

        const k = checkbox.getAttribute('data-field');
        const val = sec.querySelector('.compare-edit-input').value;
        
        if (k === 'summary') {
            resumeData.summary = val;
            document.getElementById('input-summary').value = val;
        } else if (k === 'skills') {
            resumeData.skills = val;
            document.getElementById('input-skills').value = val;
        } else if (k === 'experience_raw') {
            resumeData.experience = [];
            document.getElementById('experience-list').innerHTML = '';
            
            const entries = splitEntries(val);
            entries.forEach(e => {
                const newItem = addItem('experience');
                if (newItem) {
                    const lines = e.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const parsed = parseExperienceEntry(lines);
                    newItem.querySelector('.item-company').value = parsed.company;
                    newItem.querySelector('.item-position').value = parsed.position;
                    newItem.querySelector('.item-duration').value = parsed.date;
                    newItem.querySelector('.item-desc').value = parsed.desc;
                }
            });
        } else if (k === 'education_raw') {
            resumeData.education = [];
            document.getElementById('education-list').innerHTML = '';
            
            const entries = splitEntries(val);
            entries.forEach(e => {
                const newItem = addItem('education');
                if (newItem) {
                    const lines = e.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const parsed = parseEducationEntry(lines);
                    newItem.querySelector('.item-school').value = parsed.school;
                    newItem.querySelector('.item-degree').value = parsed.degree;
                    newItem.querySelector('.item-year').value = parsed.date;
                    newItem.querySelector('.item-desc').value = parsed.desc;
                }
            });
        } else if (resumeData.personal.hasOwnProperty(k)) {
            resumeData.personal[k] = val;
            const el = document.getElementById('input-' + k);
            if (el) el.value = val;
        }
    });

    closeLinkedInModal();
    updatePreview();
}

function parseExperienceEntry(lines) {
    const result = { company: '', position: '', date: '', desc: '' };
    if (lines.length === 0) return result;

    const titleKeywords = ['engineer', 'manager', 'developer', 'analyst', 'lead', 'specialist', 'officer', 'architect', 'consultant', 'intern', 'trainee'];
    const dateRegex = /(?:19|20)\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current/i;

    // First 2 lines are usually Company/Title/Date
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
        const line = lines[i];
        if (dateRegex.test(line) && !result.date) {
            result.date = line;
        } else if (titleKeywords.some(k => line.toLowerCase().includes(k)) && !result.position) {
            result.position = line;
        } else if (!result.company) {
            result.company = line;
        } else if (!result.position) {
            result.position = line;
        }
    }

    // Remaining lines are description
    result.desc = lines.filter(l => l !== result.company && l !== result.position && l !== result.date).join('\n');
    
    // Clean up empty fields
    if (!result.company) result.company = 'Company Name';
    if (!result.position) result.position = 'Professional Role';
    
    return result;
}

function parseEducationEntry(lines) {
    const result = { school: '', degree: '', date: '', desc: '' };
    if (lines.length === 0) return result;


function insertBullet(btn) {
    const textarea = btn.closest(".input-group").querySelector("textarea");
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const bullet = "• ";
    textarea.value = text.slice(0, start) + bullet + text.slice(start);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + bullet.length;
    updatePreview();
}

function splitEntries(text) {
    if (!text) return [];
    const blocks = text.split(/\n\s*\n/);
    if (blocks.length > 1) {
        return blocks.filter(b => b.trim().length > 15);
    }
    const lines = text.split("\n");
    let entries = [];
    let current = [];
    lines.forEach(l => {
        const hasDate = /(?:19|20)\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current/i.test(l);
        if (hasDate && current.length > 1 && l.length < 60) {
            entries.push(current.join("\n"));
            current = [l];
        } else {
            current.push(l);
        }
    });
    if (current.length > 0) entries.push(current.join("\n"));
    return entries.filter(e => e.trim().length > 10);
}



function splitEntries(text) {
    if (!text) return [];
    const blocks = text.split(/\n\s*\n/);
    if (blocks.length > 1) {
        return blocks.filter(b => b.trim().length > 15);
    }
    const lines = text.split("\n");
    let entries = [];
    let current = [];
    lines.forEach(l => {
        const hasDate = /(?:19|20)\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current/i.test(l);
        if (hasDate && current.length > 1 && l.length < 60) {
            entries.push(current.join("\n"));
            current = [l];
        } else {
            current.push(l);
        }
    });
    if (current.length > 0) entries.push(current.join("\n"));
    return entries.filter(e => e.trim().length > 10);
}
    const eduKeywords = ['university', 'college', 'school', 'institute', 'academy', 'polytechnic'];
    const degreeKeywords = ['bachelor', 'master', 'phd', 'diploma', 'degree', 'license', 'bs', 'ms', 'ba', 'ma', 'b.sc', 'm.sc'];
    const dateRegex = /(?:19|20)\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current/i;

    for (let i = 0; i < Math.min(lines.length, 3); i++) {
        const line = lines[i];
        if (dateRegex.test(line) && !result.date) {
            result.date = line.match(/(?:19|20)\d{2}/)?.[0] || line;
        } else if (eduKeywords.some(k => line.toLowerCase().includes(k)) && !result.school) {
            result.school = line;
        } else if (degreeKeywords.some(k => line.toLowerCase().includes(k)) && !result.degree) {
            result.degree = line;
        } else if (!result.school) {
            result.school = line;
        } else if (!result.degree) {
            result.degree = line;
        }
    }
    result.desc = lines.filter(l => l !== result.school && l !== result.degree && l !== result.date).join('\n');
    
    if (!result.school) result.school = 'Educational Institution';
    if (!result.degree) result.degree = 'Field of Study';

    return result;
}

// ═════════════════════════════════════════════════════
//  SECTION CLEARING
// ═════════════════════════════════════════════════════
function clearPersonalData() {
    if (!confirm('Clear all personal details?')) return;
    pushToHistory();
    Object.keys(resumeData.personal).forEach(k => resumeData.personal[k] = '');
    ['name','email','phone','location','title','linkedin','github','website','twitter'].forEach(k => {
        const el = document.getElementById('input-' + k);
        if (el) el.value = '';
    });
    updatePreview();
}

function clearSummaryData() {
    pushToHistory();
    resumeData.summary = '';
    const el = document.getElementById('input-summary');
    if (el) el.value = '';
    updatePreview();
}

function clearExperienceData() {
    if (!confirm('Remove all work experience entries?')) return;
    pushToHistory();
    resumeData.experience = [];
    document.getElementById('experience-list').innerHTML = '';
    updatePreview();
}

function clearEducationData() {
    if (!confirm('Remove all education entries?')) return;
    pushToHistory();
    resumeData.education = [];
    document.getElementById('education-list').innerHTML = '';
    updatePreview();
}

function clearSkillsData() {
    pushToHistory();
    resumeData.skills = '';
    const el = document.getElementById('input-skills');
    if (el) el.value = '';
    updatePreview();
}

function clearProjectsData() {
    if (!confirm('Remove all projects?')) return;
    pushToHistory();
    resumeData.projects = [];
    document.getElementById('projects-list').innerHTML = '';
    updatePreview();
}

function splitEntries(text) {
    if (!text) return [];
    
    // Split by common separators: large blocks of whitespace or date-looking markers
    const blocks = text.split(/\n\s*\n/);
    if (blocks.length > 1) {
        return blocks.filter(b => b.trim().length > 15);
    }
    
    // If no blocks, try splitting by bullet points or common keywords 
    const lines = text.split('\n');
    let entries = [];
    let current = [];
    
    lines.forEach(l => {
        const hasDate = /(?:19|20)\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Current/i.test(l);
        if (hasDate && current.length > 1 && l.length < 60) {
            entries.push(current.join('\n'));
            current = [l];
        } else {
            current.push(l);
        }
    });
    if (current.length > 0) entries.push(current.join('\n'));
    
    return entries.filter(e => e.trim().length > 10);
}

function closeLinkedInModal() { document.getElementById('linkedin-modal').style.display = 'none'; }
function closeAIModal()       { document.getElementById('ai-modal').style.display = 'none'; }

// ═════════════════════════════════════════════════════
//  EXPORT: PDF (Improved with html2pdf for links)
// ═════════════════════════════════════════════════════
async function exportPDF() {
    const preview = document.getElementById('resume-preview');
    const opt = {
        margin:       0,
        filename:     (resumeData.personal.name || 'resume') + '.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: resumeData.settings.pageSize || 'a4', orientation: 'portrait' }
    };
    
    // Temporarily reset zoom for accurate capture
    const origTransform = preview.style.transform;
    preview.style.transform = 'scale(1)';
    
    html2pdf().set(opt).from(preview).save().then(() => {
        preview.style.transform = origTransform;
    });
}

// ═════════════════════════════════════════════════════
//  EXPORT: HTML
// ═════════════════════════════════════════════════════
function exportHTML() {
    const content = document.getElementById('resume-preview').outerHTML;
    const css = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => `<link rel="stylesheet" href="${l.href}">`).join('\n');
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${resumeData.personal.name || 'Resume'}</title>${css}</head><body style="background:#fff;display:flex;justify-content:center;padding:20px">${content}</body></html>`;
    downloadBlob(html, (resumeData.personal.name || 'resume') + '.html', 'text/html');
}

// ═════════════════════════════════════════════════════
//  EXPORT: JSON
// ═════════════════════════════════════════════════════
function exportJSON() {
    const snapshot = {
        ...resumeData,
        experience: getDynamicItems('experience'),
        education:  getDynamicItems('education'),
        projects:   getDynamicItems('projects'),
        customSections: getCustomSections()
    };
    downloadBlob(JSON.stringify(snapshot, null, 2), (resumeData.personal.name || 'resume') + '.json', 'application/json');
}

// ═════════════════════════════════════════════════════
//  EXPORT: CSV
// ═════════════════════════════════════════════════════
function exportCSV() {
    const p = resumeData.personal;
    const rows = [
        ['Section','Field','Value'],
        ['Personal','Name', p.name],
        ['Personal','Email', p.email],
        ['Personal','Phone', p.phone],
        ['Personal','Location', p.location],
        ['Personal','Title', p.title],
        ['Personal','LinkedIn', p.linkedin],
        ['Personal','GitHub', p.github],
        ['Summary','Summary', resumeData.summary],
        ['Skills','Skills', resumeData.skills],
        ...getDynamicItems('experience').map((e,i) => ['Experience #'+(i+1),'Position / Company', `${e.position} at ${e.company} (${e.duration})`]),
        ...getDynamicItems('education').map((e,i)  => ['Education #'+(i+1), 'Degree / School', `${e.degree} – ${e.school} (${e.year})`]),
        ...getDynamicItems('projects').map((p,i)   => ['Project #'+(i+1), 'Name', p['project-name']||p.projectname||''])
    ];
    const csv = rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    downloadBlob(csv, (resumeData.personal.name || 'resume') + '.csv', 'text/csv');
}

// ═════════════════════════════════════════════════════
//  EXPORT: Word (.doc via HTML)
// ═════════════════════════════════════════════════════
function exportWord() {
    const content = document.getElementById('resume-preview').innerHTML;
    const wordHTML = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>${resumeData.personal.name||'Resume'}</title>
        <style>body{font-family:Arial,sans-serif;font-size:11pt;color:#222;margin:20mm}
        .resume-name{font-size:22pt;font-weight:bold}.section-title{font-size:11pt;font-weight:bold;border-bottom:1pt solid #333;margin-top:12pt;margin-bottom:4pt}
        .item-meta{font-weight:bold}.item-submeta{color:#555;font-style:italic}.skill-tag{display:inline-block;background:#eee;padding:2pt 5pt;border-radius:3pt;margin:2pt}
        </style></head>
        <body>${content}</body></html>`;
    downloadBlob(wordHTML, (resumeData.personal.name || 'resume') + '.doc', 'application/msword');
}

// ═════════════════════════════════════════════════════
//  SHARE
// ═════════════════════════════════════════════════════
function shareResume() {
    const snapshot = {
        ...resumeData,
        experience: getDynamicItems('experience'),
        education:  getDynamicItems('education'),
        projects:   getDynamicItems('projects'),
        customSections: getCustomSections()
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))));
    const url = window.location.href.split('?')[0] + '?resume=' + encoded;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => alert('📋 Shareable link copied to clipboard!'));
    } else {
        prompt('Copy this link:', url);
    }
}

// ═════════════════════════════════════════════════════
//  LOAD FROM URL PARAM
// ═════════════════════════════════════════════════════
function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('resume');
    if (!encoded) return;
    try {
        const data = JSON.parse(decodeURIComponent(escape(atob(encoded))));
        mergeResumeData(data);
    } catch(e) { console.warn('Could not load resume from URL'); }
}

// ═════════════════════════════════════════════════════
//  MERGE (for upload & URL load)
// ═════════════════════════════════════════════════════
function mergeResumeData(data, silent = false) {
    if (data.personal)  Object.assign(resumeData.personal, data.personal);
    if (data.summary !== undefined)   resumeData.summary = data.summary;
    if (data.skills !== undefined)    resumeData.skills  = data.skills;
    if (data.settings)  Object.assign(resumeData.settings, data.settings);
    if (data.photo !== undefined)     resumeData.photo   = data.photo;
    if (data.iconSet)   resumeData.iconSet = data.iconSet;

    // Repopulate text inputs
    const p = resumeData.personal;
    ['name','email','phone','location','title','linkedin','github','website','twitter'].forEach(k => {
        const el = document.getElementById('input-' + k);
        if (el) el.value = p[k] || '';
    });
    const sumEl = document.getElementById('input-summary');
    if (sumEl) sumEl.value = resumeData.summary || '';
    const skEl = document.getElementById('input-skills');
    if (skEl) skEl.value = resumeData.skills || '';

    // Photo
    if (resumeData.photo) {
        document.getElementById('photo-preview').innerHTML = `<img src="${resumeData.photo}" alt="Profile photo">`;
        document.getElementById('remove-photo-btn').style.display = 'inline-block';
    } else {
        document.getElementById('photo-preview').innerHTML = '<span>📷</span><small>Click to upload photo</small>';
        document.getElementById('remove-photo-btn').style.display = 'none';
    }

    // Apply theme/font
    document.querySelectorAll('.theme-card').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-theme') === resumeData.settings.theme);
    });
    const fontEl = document.getElementById('setting-font');
    if (fontEl) fontEl.value = resumeData.settings.font || 'font-inter';
    const hFontEl = document.getElementById('setting-heading-font');
    if (hFontEl) hFontEl.value = resumeData.settings.headingFont || 'font-inter';

    document.getElementById('setting-color').value = resumeData.settings.primaryColor;
    document.getElementById('setting-text-color').value = resumeData.settings.textColor;
    document.getElementById('font-size-display').textContent = (resumeData.settings.fontSize || 10) + 'pt';
    const hSizeEl = document.getElementById('heading-size-display');
    if (hSizeEl) hSizeEl.textContent = (resumeData.settings.headingSize || 16) + 'pt';

    // Repopulate dynamic sections
    ['experience','education','projects'].forEach(type => {
        const list = document.getElementById(type + '-list');
        if (!list || !data[type]) return;
        list.innerHTML = '';
        data[type].forEach(item => {
            const newItem = addItem(type);
            if (!newItem) return;
            Object.keys(item).forEach(key => {
                const inp = newItem.querySelector('.item-' + key);
                if (inp) inp.value = item[key];
            });
        });
    });
    
    // Repopulate custom sections
    document.querySelectorAll('.form-custom-section-instance').forEach(el => el.remove());
    if (data.customSections) {
        data.customSections.forEach(cs => {
            addCustomSection(cs.side || 'right');
            const el = document.getElementById('form-settings').previousElementSibling;
            if (el) {
                el.querySelector('.cs-title').value = cs.title || '';
                el.querySelector('.cs-desc').value  = cs.desc  || '';
                const entryList = el.querySelector('.cs-entries');
                cs.entries.forEach(e => {
                    const addEntryBtn = el.querySelector('.btn-add'); 
                    if (addEntryBtn) addCustomEntry(addEntryBtn); 
                    const entryEl = entryList.lastElementChild;
                    if (entryEl) {
                        entryEl.querySelector('.ce-title').value = e.title || '';
                        entryEl.querySelector('.ce-date').value  = e.date  || '';
                        entryEl.querySelector('.ce-desc').value  = e.desc  || '';
                        if (e.lines && e.lines.length) {
                            const addLineBtn = entryEl.querySelector('button[onclick="addCustomLine(this)"]');
                            e.lines.forEach(l => {
                                if (addLineBtn) addCustomLine(addLineBtn);
                                const newLines = entryEl.querySelector('.ce-lines').children;
                                if(newLines.length > 0) {
                                  newLines[newLines.length - 1].querySelector('input').value = l;
                                }
                            });
                        }
                    }
                });
            }
        });
    }

    refreshSidebarNav();
    updatePreview();
    if (!silent) alert('✅ Resume loaded successfully!');
}

// ═════════════════════════════════════════════════════
//  UTILITY
// ═════════════════════════════════════════════════════
function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════
//  SAMPLE DATA
// ═════════════════════════════════════════════════════
function loadSampleData() {
    // Check URL first
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume')) { loadFromURL(); return; }

    resumeData.personal = {
        name: 'Alexander Sterling', email: 'alex.sterling@techmail.com',
        phone: '+1 (555) 123-4567', location: 'San Francisco, CA',
        title: 'Senior Software Architect', linkedin: 'linkedin.com/in/alexsterling',
        github: 'github.com/alexsterling', website: 'alexsterling.dev', twitter: '@alexsterling'
    };
    resumeData.summary = 'Passionate Software Architect with 10+ years of experience building scalable distributed systems. Expert in cloud-native technologies, AI integration, and leading high-performance engineering teams.';
    resumeData.skills  = 'JavaScript, TypeScript, React, Node.js, AWS, Kubernetes, GraphQL, System Design, Python, TensorFlow';

    const fields = ['name','email','phone','location','title','linkedin','github','website','twitter'];
    fields.forEach(k => {
        const el = document.getElementById('input-' + k);
        if (el) el.value = resumeData.personal[k];
    });
    document.getElementById('input-summary').value = resumeData.summary;
    document.getElementById('input-skills').value  = resumeData.skills;

    addItem('experience');
    const exp = document.querySelector('#experience-list .list-item');
    if (exp) {
        exp.querySelector('.item-company').value  = 'TechNova Solutions';
        exp.querySelector('.item-position').value = 'Lead Engineer';
        exp.querySelector('.item-duration').value = '2020 – Present';
        exp.querySelector('.item-city').value     = 'Remote';
        exp.querySelector('.item-desc').value     = '• Led migration of monolithic architecture to microservices, cutting deployment time by 60%.\n• Improved system performance by 40% through query optimization and caching.\n• Mentored a team of 15 engineers across 3 time zones.';
    }

    addItem('education');
    const edu = document.querySelector('#education-list .list-item');
    if (edu) {
        edu.querySelector('.item-school').value  = 'Massachusetts Institute of Technology';
        edu.querySelector('.item-degree').value  = 'M.Sc. in Computer Science';
        edu.querySelector('.item-year').value    = '2016';
        edu.querySelector('.item-score').value   = 'GPA 4.0/4.0';
    }

    addItem('projects');
    const proj = document.querySelector('#projects-list .list-item');
    if (proj) {
        proj.querySelector('.item-project-name').value = 'AI Resume Architect';
        proj.querySelector('.item-project-link').value = 'github.com/alex/resume-architect';
        proj.querySelector('.item-project-tech').value = 'HTML, CSS, JavaScript, AI';
        proj.querySelector('.item-project-desc').value = '• Built a full-featured resume builder with AI writing assistance and multi-format export.\n• Supports 8 professional templates with real-time live preview.';
    }
}
async function extractTextFromPDF(file) {
    const status = document.getElementById('linkedin-status');
    status.textContent = '⏳ Extracting PDF text…';
    status.className = 'linkedin-status';

    try {
        if (typeof pdfjsLib === 'undefined') {
             throw new Error("PDF library not loaded correctly.");
        }
        
        // Ensure worker is configured
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Improved PDF extraction for columns
            let items = textContent.items.map(item => ({
                str: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height
            }));

            if (items.length === 0) continue;

            // Sort items primarily by Y (top to bottom), secondarily by X (left to right)
            // Note: PDF coordinates usually have Y increasing from bottom to top
            items.sort((a, b) => b.y - a.y || a.x - b.x);

            let pageLines = [];
            let currentLine = [];
            let lastY = items[0].y;

            items.forEach(item => {
                if (Math.abs(item.y - lastY) > 5) { // Threshold for new line
                    pageLines.push(currentLine);
                    currentLine = [];
                    lastY = item.y;
                }
                currentLine.push(item);
            });
            pageLines.push(currentLine);

            // For each line, check if there's a big horizontal gap indicative of columns
            let pageText = '';
            pageLines.forEach(line => {
                line.sort((a, b) => a.x - b.x);
                let lineText = '';
                let lastX = -1;
                line.forEach(item => {
                    // Logic for spacing: if gap is huge, columns. If gap is small, merge. If gap is tiny, no space.
                    if (lastX !== -1) {
                        const gap = item.x - lastX;
                        if (gap > 40) lineText += '    '; 
                        else if (gap > 1.5) lineText += ' ';
                    }
                    lineText += item.str;
                    lastX = item.x + item.width;
                });
                pageText += lineText + '\n';
            });
            fullText += pageText + '\n';
        }
        
        fullText = fullText.replace(/ {2,}/g, ' '); // Clean redundant spaces
        
        if (!fullText.trim()) throw new Error("Could not extract any text from PDF.");
        
        status.textContent = `✓ Extracted ${fullText.split(/\s+/).length} words. Analyzing...`;
        document.getElementById('import-text-input').value = fullText;
        triggerLinkedInAutofill();
    } catch (err) {
        console.error(err);
        status.textContent = '❌ Failed to extract PDF text.';
        status.className = 'linkedin-status error';
    }
}

// ═════════════════════════════════════════════════════
//  PROFILE MANAGEMENT
// ═════════════════════════════════════════════════════
function saveCurrentProfile() {
    let profiles = JSON.parse(localStorage.getItem('resumeProfiles') || '[]');
    let name = prompt('Enter a name for this profile (e.g. Software Engineer, Civil Engineer):');
    if (!name) return;
    
    const snapshot = getResumeSnapshot();
    const newId = 'prof_' + Date.now();
    
    profiles.push({
        id: newId,
        name: name,
        date: new Date().toLocaleDateString(),
        data: snapshot
    });
    
    localStorage.setItem('resumeProfiles', JSON.stringify(profiles));
    activeProfileId = newId;
    loadProfileList();
    alert('✅ Profile saved and set as active!');
}

function updateActiveProfile() {
    if (!activeProfileId) {
        saveCurrentProfile();
        return;
    }
    
    let profiles = JSON.parse(localStorage.getItem('resumeProfiles') || '[]');
    let idx = profiles.findIndex(p => p.id === activeProfileId);
    
    if (idx === -1) {
        activeProfileId = null;
        saveCurrentProfile();
        return;
    }

    profiles[idx].data = getResumeSnapshot();
    profiles[idx].date = new Date().toLocaleDateString() + ' (Updated)';
    
    localStorage.setItem('resumeProfiles', JSON.stringify(profiles));
    loadProfileList();
    alert('✅ Active profile updated successfully!');
}

function getResumeSnapshot() {
    return {
        ...resumeData,
        experience: getDynamicItems('experience'),
        education:  getDynamicItems('education'),
        projects:   getDynamicItems('projects'),
        customSections: getCustomSections()
    };
}

function loadProfileList() {
    const list = document.getElementById('profiles-list');
    const sideIndicator = document.getElementById('active-profile-indicator');
    const sideName = document.getElementById('current-profile-name');
    const quickUpdateBtn = document.getElementById('sidebar-update-btn');
    
    if (!list) return;
    list.innerHTML = '';
    let profiles = JSON.parse(localStorage.getItem('resumeProfiles') || '[]');
    
    if (activeProfileId) {
        const activeProf = profiles.find(p => p.id === activeProfileId);
        if (activeProf) {
            if (sideIndicator) sideIndicator.style.display = 'block';
            if (sideName) sideName.textContent = activeProf.name;
            if (quickUpdateBtn) quickUpdateBtn.style.display = 'block';
        } else {
            activeProfileId = null;
            if (sideIndicator) sideIndicator.style.display = 'none';
            if (quickUpdateBtn) quickUpdateBtn.style.display = 'none';
        }
    } else {
        if (sideIndicator) sideIndicator.style.display = 'none';
        if (quickUpdateBtn) quickUpdateBtn.style.display = 'none';
    }

    if (profiles.length === 0) {
        list.innerHTML = '<p class="input-hint" style="text-align:center; padding: 2rem">No saved profiles yet.</p>';
        return;
    }
    
    profiles.forEach(prof => {
        const isActive = prof.id === activeProfileId;
        const div = document.createElement('div');
        div.className = 'list-item' + (isActive ? ' active-profile-item' : '');
        div.style.borderLeft = isActive ? '4px solid var(--primary)' : '1px solid var(--border)';
        
        div.innerHTML = `
            <div class="item-header" style="margin-bottom:0; border-bottom:none; align-items:center">
                <div style="flex:1">
                    <div style="display:flex; align-items:center; gap:0.5rem">
                        <h3 style="font-size:1.05rem; color:var(--text-main); margin-bottom:0">${prof.name}</h3>
                        ${isActive ? '<span class="active-badge">ACTIVE</span>' : ''}
                    </div>
                    <span style="font-size:0.8rem; color:var(--text-dim)">${prof.date}</span>
                </div>
                <div class="item-header-actions" style="gap:0.4rem">
                    <button class="btn ${isActive ? 'btn-secondary' : 'btn-primary'}" style="padding:0.4rem 0.8rem; font-size: 0.75rem" onclick="loadProfile('${prof.id}')">${isActive ? 'Reload' : 'Load'}</button>
                    <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size: 0.75rem" onclick="renameProfile('${prof.id}', '${prof.name.replace(/'/g, "\\'")}')" title="Rename">✏️</button>
                    <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size: 0.75rem" onclick="duplicateProfile('${prof.id}')" title="Duplicate Profile">📋</button>
                    <button class="btn-remove" onclick="deleteProfile('${prof.id}')">×</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

function loadProfile(id) {
    if (!confirm('Loading this profile will overwrite your current changes. Continue?')) return;
    let profiles = JSON.parse(localStorage.getItem('resumeProfiles') || '[]');
    const prof = profiles.find(p => p.id === id);
    if (prof) {
        activeProfileId = id;
        mergeResumeData(prof.data);
        loadProfileList(); // Refresh to show active state
        document.getElementById('nav-personal').click(); 
    }
}

function deleteProfile(id) {
    if (!confirm('Are you sure you want to delete this profile?')) return;
    if (id === activeProfileId) activeProfileId = null;
    let profiles = JSON.parse(localStorage.getItem('resumeProfiles') || '[]');
    profiles = profiles.filter(p => p.id !== id);
    localStorage.setItem('resumeProfiles', JSON.stringify(profiles));
    loadProfileList();
}

function duplicateProfile(id) {
    let profiles = JSON.parse(localStorage.getItem('resumeProfiles') || '[]');
    const prof = profiles.find(p => p.id === id);
    if (!prof) return;

    const newName = prompt('Enter a name for the duplicated profile:', prof.name + ' (Copy)');
    if (!newName) return;

    const newProf = {
        ...prof,
        id: 'prof_' + Date.now(),
        name: newName,
        date: new Date().toLocaleDateString()
    };

    profiles.push(newProf);
    localStorage.setItem('resumeProfiles', JSON.stringify(profiles));
    loadProfileList();
    alert('✅ Profile duplicated!');
}

function renameProfile(id, currentName) {
    const newName = prompt('Enter a new name for this profile:', currentName);
    if (!newName || newName === currentName) return;

    let profiles = JSON.parse(localStorage.getItem('resumeProfiles') || '[]');
    let idx = profiles.findIndex(p => p.id === id);
    if (idx !== -1) {
        profiles[idx].name = newName;
        localStorage.setItem('resumeProfiles', JSON.stringify(profiles));
        loadProfileList();
    }
}
// ═════════════════════════════════════════════════════
//  STRENGTH METER
// ═════════════════════════════════════════════════════
function updateStrengthMeter() {
    const bar = document.getElementById('strength-bar-fill');
    const percentTxt = document.getElementById('strength-percent');
    const tipTxt = document.getElementById('strength-tip');
    if (!bar) return;

    let score = 0;
    let tips = [];

    // Personal Info (20 pts)
    if (resumeData.personal.name) score += 5; else tips.push("Add your full name");
    if (resumeData.personal.email) score += 5; else tips.push("Add contact email");
    if (resumeData.personal.title) score += 5;
    if (resumeData.personal.location) score += 5;

    // Summary (15 pts)
    if (resumeData.summary && resumeData.summary.length > 50) score += 15;
    else tips.push("Write a short professional summary");

    // Experience (30 pts)
    const exp = getDynamicItems('experience');
    if (exp.length > 0) {
        score += 15;
        if (exp.some(e => e.desc && e.desc.length > 40)) score += 15;
        else tips.push("Add descriptions to your work roles");
    } else tips.push("Add at least one work experience");

    // Education (15 pts)
    const edu = getDynamicItems('education');
    if (edu.length > 0) score += 15;
    else tips.push("Include your education details");

    // Skills (10 pts)
    if (resumeData.skills && resumeData.skills.split(',').length >= 3) score += 10;
    else tips.push("List at least 3-5 core skills");

    // Photo/Social (10 pts)
    if (resumeData.photo) score += 5;
    if (resumeData.personal.linkedin || resumeData.personal.github) score += 5;

    score = Math.min(100, score);
    bar.style.width = score + '%';
    percentTxt.textContent = score + '%';

    if (score < 30) tipTxt.textContent = "Getting started! " + (tips[0] || "");
    else if (score < 70) tipTxt.textContent = "Looking good. " + (tips[0] || "");
    else if (score < 100) tipTxt.textContent = "Almost there! " + (tips[0] || "");
    else tipTxt.textContent = "Perfect! Your resume is highly competitive.";

    // Smooth color transition for strength bar
    if (score < 40) bar.style.background = '#f87171';
    else if (score < 80) bar.style.background = '#fbbf24';
    else bar.style.background = 'linear-gradient(to right, #818cf8, #f472b6)';
}
