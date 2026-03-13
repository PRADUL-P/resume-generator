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
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
            document.getElementById('form-' + sec).classList.add('active');
            // close sidebar on mobile
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
        const navBtn = document.querySelector(`.nav-item[data-section="${id}"]`);
        if (navBtn) navBtn.click();
    }, 10);
}

function removeCustomSection(id) {
    if (!confirm('Are you sure you want to delete this custom section tab?')) return;
    const sec = document.getElementById('form-' + id);
    if (sec) sec.remove();
    refreshSidebarNav();
    updatePreview();
    document.getElementById('nav-personal').click(); // Switch to personal tab
}

function refreshSidebarNav() {
    const container = document.getElementById('dynamic-nav-sections');
    container.innerHTML = '';
    document.querySelectorAll('.form-custom-section-instance').forEach(el => {
        const title = el.querySelector('.cs-title').value || 'New Section';
        const id = el.getAttribute('data-cid');
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        btn.setAttribute('data-section', id);
        btn.innerHTML = `<span class="icon">✨</span><span class="nav-label">${title}</span>`;
        btn.onclick = () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
            document.getElementById('form-' + id).classList.add('active');
            if (window.innerWidth <= 640) {
                document.getElementById('sidebar').classList.remove('mobile-open');
            }
        };
        container.appendChild(btn);
    });
}

function addCustomEntry(btn) {
    const entries = btn.previousElementSibling;
    const div = document.createElement('div');
    div.className = 'custom-entry';
    div.innerHTML = `
      <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-bottom:0.5rem">
        <button class="ai-item-btn" onclick="aiEnhanceCustomEntry(this)" title="AI Enhance" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem">✨</button>
        <button class="btn-remove" onclick="this.closest('.custom-entry').remove();updatePreview()" style="background:transparent; border:none; color:var(--accent-red); cursor:pointer; font-size:1.2rem; line-height:1">×</button>
      </div>
      <div class="input-row">
        <div class="input-group">
          <label>Entry Title</label>
          <input type="text" class="ce-title" placeholder="e.g. AWS Certified Developer" oninput="updatePreview()">
        </div>
        <div class="input-group">
          <label>Date / Detail</label>
          <input type="text" class="ce-date" placeholder="e.g. 2023" oninput="updatePreview()">
        </div>
      </div>
      <div class="input-group">
        <label>Extra Details / Bullet Points</label>
        <div class="ce-lines"></div>
        <button class="btn-add" style="font-size:0.75rem; padding:0.2rem 0.5rem" onclick="addCustomLine(this)">+ Add Bullet Point</button>
      </div>
      <div class="input-group">
        <label>Description (One block)</label>
        <textarea class="ce-desc" placeholder="Additional details…" oninput="updatePreview()" rows="2"></textarea>
      </div>
    `;
    div.style.position = 'relative';
    entries.appendChild(div);
}

function insertBullet(btn) {
    const textarea = btn.parentElement.querySelector('textarea');
    if (textarea) {
        let val = textarea.value;
        if (val && !val.endsWith('\n')) val += '\n';
        textarea.value = val + '• ';
        textarea.focus();
        updatePreview();
    }
}

function addCustomLine(btn) {
    const container = btn.previousElementSibling;
    const div = document.createElement('div');
    div.className = 'custom-line-item';
    div.innerHTML = `
        <div style="display:flex; gap:0.5rem; margin-bottom:0.25rem">
            <input type="text" class="ce-line-val" placeholder="Detail point…" oninput="updatePreview()">
            <button class="btn-remove" style="padding:0 0.5rem" onclick="this.parentElement.remove();updatePreview()">×</button>
        </div>
    `;
    container.appendChild(div);
}

function getCustomSections() {
    const sections = [];
    document.querySelectorAll('.form-custom-section-instance').forEach(el => {
        const title = el.querySelector('.cs-title')?.value || '';
        const desc  = el.querySelector('.cs-desc')?.value  || '';
        const side  = el.querySelector('.cs-side')?.value  || 'right';
        const entries = [];
        el.querySelectorAll('.custom-entry').forEach(e => {
            const lines = [];
            e.querySelectorAll('.ce-line-val').forEach(l => lines.push(l.value));
            entries.push({
                title: e.querySelector('.ce-title')?.value || '',
                date:  e.querySelector('.ce-date')?.value  || '',
                desc:  e.querySelector('.ce-desc')?.value  || '',
                lines: lines
            });
        });
        if (title) sections.push({ title, desc, side, entries });
    });
    return sections;
}

// ═════════════════════════════════════════════════════
//  SETTINGS
// ═════════════════════════════════════════════════════
function setPageSize(size) {
    resumeData.settings.pageSize = size;
    updatePreview();
}

const PAGE_DIMENSIONS = {
    a4:     { w: '210mm', h: '297mm' },
    letter: { w: '216mm', h: '279mm' },
    legal:  { w: '216mm', h: '356mm' }
};

function setSidebarSide(side) {
    resumeData.settings.sidebarSide = side;
    const btnLeft = document.getElementById('side-left');
    const btnRight = document.getElementById('side-right');
    if (btnLeft) btnLeft.classList.toggle('active', side === 'left');
    if (btnRight) btnRight.classList.toggle('active', side === 'right');
    updatePreview();
}

// ═════════════════════════════════════════════════════
//  PREVIEW RENDERER
// ═════════════════════════════════════════════════════
let autoSaveTimeout = null;

function updatePreview() {
    const preview = document.getElementById('resume-preview');
    const { personal, summary, settings } = resumeData;
    const experience = getDynamicItems('experience');
    const education  = getDynamicItems('education');
    const projects   = getDynamicItems('projects');
    const customs    = getCustomSections();
    const icons      = getIcons();
    const fs         = settings.fontSize;
    const hfs        = settings.headingSize || 16;
    const hFont      = settings.headingFont || 'font-inter';

    const FONT_FAMILIES = {
        'font-inter': "'Inter', sans-serif",
        'font-outfit': "'Outfit', sans-serif",
        'font-arial': "Arial, Helvetica, sans-serif",
        'font-serif': "'Playfair Display', Georgia, serif",
        'font-lato': "'Lato', sans-serif",
        'font-merriweather': "'Merriweather', Georgia, serif"
    };

    preview.className = `resume-paper ${settings.theme} ${settings.font} ${settings.sidebarSide === 'right' ? 'sidebar-right' : ''}`;
    
    // Page Size Styling
    const dim = PAGE_DIMENSIONS[settings.pageSize || 'a4'];
    preview.style.width = dim.w;
    preview.style.minHeight = dim.h;

    preview.style.setProperty('--resume-primary', settings.primaryColor);
    preview.style.setProperty('--resume-text', settings.textColor);
    preview.style.setProperty('--resume-heading-font', FONT_FAMILIES[hFont] || FONT_FAMILIES['font-inter']);
    preview.style.setProperty('--resume-heading-size', hfs + 'pt');
    preview.style.color = settings.textColor;
    preview.style.fontSize = fs + 'pt';

    const photoHTML = resumeData.photo
        ? `<img src="${resumeData.photo}" class="resume-photo" alt="Profile">`
        : '';

    const contactInlineHTML = `
        <div class="contact-inline">
            ${personal.email    ? `<span>${icons.email} <a href="mailto:${personal.email}">${personal.email}</a></span>` : ''}
            ${personal.phone    ? `<span>${icons.phone} <a href="tel:${personal.phone}">${personal.phone}</a></span>` : ''}
            ${personal.location ? `<span>${icons.location} ${personal.location}</span>` : ''}
            ${personal.linkedin ? `<span>${icons.linkedin} <a href="${personal.linkedin.startsWith('http') ? personal.linkedin : 'https://' + personal.linkedin}" target="_blank">LinkedIn</a></span>` : ''}
            ${personal.github   ? `<span>${icons.github} <a href="${personal.github.startsWith('http') ? personal.github : 'https://' + personal.github}" target="_blank">GitHub</a></span>` : ''}
            ${personal.website  ? `<span>${icons.website} <a href="${personal.website.startsWith('http') ? personal.website : 'https://' + personal.website}" target="_blank">${personal.website}</a></span>` : ''}
            ${personal.twitter  ? `<span>${icons.twitter} <a href="https://twitter.com/${personal.twitter.replace('@','')}" target="_blank">${personal.twitter}</a></span>` : ''}
        </div>`;

    const experienceHTML = experience.length ? `
        <div class="section-title">Experience</div>
        ${experience.map(exp => `
          <div class="experience-item">
            <div class="item-meta">
              <span>${exp.position || 'Position'}</span>
              <span>${exp.duration || ''}</span>
            </div>
            <div class="item-submeta">
              <span>${exp.company || 'Company'}</span>
              <span>${exp.city || ''}</span>
            </div>
            <div class="item-description">${renderDescription(exp.desc)}</div>
          </div>`).join('')}` : '';

    const educationHTML = education.length ? `
        <div class="section-title">Education</div>
        ${education.map(edu => `
          <div class="education-item">
            <div class="item-meta">
              <span>${edu.school || 'Institution'}</span>
              <span>${edu.year || ''}</span>
            </div>
            <div class="item-submeta">
              <span>${edu.degree || 'Degree'}</span>
              <span>${edu.score || ''}</span>
            </div>
            ${edu.desc ? `<div class="item-description">${renderDescription(edu.desc)}</div>` : ''}
          </div>`).join('')}` : '';

    const projectsHTML = projects.length ? `
        <div class="section-title">Projects</div>
        ${projects.map(p => `
          <div class="project-item">
            <div class="item-meta">
              <span>${p['project-name'] || p.projectname || 'Project'}</span>
              <span style="font-size:8pt;color:#6366f1">${p['project-link'] || p.projectlink || ''}</span>
            </div>
            ${(p['project-tech'] || p.projecttech) ? `<div class="item-tech-tags">${(p['project-tech']||p.projecttech||'').split(',').map(t=>`<span class="item-tech-tag">${t.trim()}</span>`).join('')}</div>` : ''}
            <div class="item-description">${p['project-desc'] || p.projectdesc || ''}</div>
          </div>`).join('')}` : '';

    const leftCustoms  = customs.filter(c => c.side === 'left');
    const rightCustoms = customs.filter(c => c.side !== 'left');

    const renderCustom = (csList) => csList.map(cs => `
        <div class="section-title">${cs.title}</div>
        ${cs.desc ? `<p style="font-size:0.85em;color:var(--text-dim);margin-bottom:2mm">${cs.desc}</p>` : ''}
        ${cs.entries.map(e => `
          <div class="custom-section-entry">
            <div class="item-meta">
              <span>${e.title}</span>
              <span style="font-size:0.9em;font-weight:normal">${e.date}</span>
            </div>
            ${e.lines && e.lines.length ? `<ul class="custom-bullet-list">${e.lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
            ${e.desc ? `<div class="item-description">${renderDescription(e.desc)}</div>` : ''}
          </div>`).join('')}`).join('');

    const leftCustomHTML  = renderCustom(leftCustoms);
    const rightCustomHTML = renderCustom(rightCustoms);

    const skillsHTML = resumeData.skills ? `
        <div class="section-title">Skills</div>
        <div class="skills-list">
          ${resumeData.skills.split(',').map(s => s.trim() ? `<span class="skill-tag">${s.trim()}</span>` : '').join('')}
        </div>` : '';

    const summaryHTML = summary ? `
        <div class="section-title">Profile</div>
        <p style="margin-bottom:5mm;font-size:${fs}pt">${summary}</p>` : '';

    // ── Theme Renders ──
    const t = settings.theme;

    if (t === 'theme-modern') {
        preview.innerHTML = `
          <div class="resume-sidebar">
            ${photoHTML ? `<div style="display:flex;justify-content:center;margin-bottom:5mm">${photoHTML}</div>` : ''}
            <div class="section-title">Contact</div>
            <div class="contact-info">
              ${personal.email    ? `<div class="contact-item">${icons.email} <a href="mailto:${personal.email}">${personal.email}</a></div>` : ''}
              ${personal.phone    ? `<div class="contact-item">${icons.phone} <a href="tel:${personal.phone}">${personal.phone}</a></div>` : ''}
              ${personal.location ? `<div class="contact-item">${icons.location} ${personal.location}</div>` : ''}
              ${personal.linkedin ? `<div class="contact-item">${icons.linkedin} <a href="${personal.linkedin.startsWith('http') ? personal.linkedin : 'https://' + personal.linkedin}" target="_blank">LinkedIn</a></div>` : ''}
              ${personal.github   ? `<div class="contact-item">${icons.github} <a href="${personal.github.startsWith('http') ? personal.github : 'https://' + personal.github}" target="_blank">GitHub</a></div>` : ''}
              ${personal.website  ? `<div class="contact-item">${icons.website} <a href="${personal.website.startsWith('http') ? personal.website : 'https://' + personal.website}" target="_blank">${personal.website}</a></div>` : ''}
            </div>
            ${skillsHTML}
            ${leftCustomHTML}
          </div>
          <div class="resume-main">
            <div class="resume-name">${personal.name || 'Your Name'}</div>
            <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
            ${summaryHTML}
            ${experienceHTML}
            ${educationHTML}
            ${projectsHTML}
            ${rightCustomHTML}
          </div>`;

    } else if (t === 'theme-minimal') {
        preview.innerHTML = `
          <div class="resume-header">
            ${photoHTML ? `<div style="float:right;margin-left:8mm">${photoHTML}</div>` : ''}
            <div class="resume-name">${personal.name || 'Your Name'}</div>
            <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
            ${contactInlineHTML}
          </div>
          ${summaryHTML}
          ${experienceHTML}
          ${educationHTML}
          ${skillsHTML}
          ${projectsHTML}
          ${leftCustomHTML}
          ${rightCustomHTML}`;

    } else if (t === 'theme-professional') {
        preview.innerHTML = `
          <div class="resume-header">
            <div class="resume-header-left">
              <div class="resume-name">${personal.name || 'Your Name'}</div>
              <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
            </div>
            <div class="resume-header-right">
              ${personal.email    ? `<div>${icons.email} ${personal.email}</div>` : ''}
              ${personal.phone    ? `<div>${icons.phone} ${personal.phone}</div>` : ''}
              ${personal.location ? `<div>${icons.location} ${personal.location}</div>` : ''}
              ${personal.linkedin ? `<div>${icons.linkedin} LinkedIn</div>` : ''}
              ${photoHTML}
            </div>
          </div>
          ${summaryHTML}
          ${experienceHTML}
          ${educationHTML}
          ${skillsHTML}
          ${projectsHTML}
          ${leftCustomHTML}
          ${rightCustomHTML}`;

    } else if (t === 'theme-creative') {
        preview.innerHTML = `
          <div class="creative-stripe"></div>
          <div class="creative-body">
            <div class="resume-header">
              ${photoHTML ? `<div style="float:right;margin-left:6mm">${photoHTML}</div>` : ''}
              <div class="resume-name">${personal.name || 'Your Name'}</div>
              <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
              ${contactInlineHTML}
            </div>
            ${summaryHTML}
            ${experienceHTML}
            ${educationHTML}
            ${skillsHTML}
            ${projectsHTML}
            ${leftCustomHTML}
          ${rightCustomHTML}
          </div>`;

    } else if (t === 'theme-executive') {
        preview.innerHTML = `
          <div class="executive-header">
            <div>
              ${photoHTML ? `<div style="float:left;margin-right:6mm">${photoHTML}</div>` : ''}
              <div class="resume-name">${personal.name || 'Your Name'}</div>
              <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
            </div>
            <div class="executive-contact">
              ${personal.email    ? `<div><a href="mailto:${personal.email}" style="color:white;text-decoration:none">${personal.email}</a></div>` : ''}
              ${personal.phone    ? `<div><a href="tel:${personal.phone}" style="color:white;text-decoration:none">${personal.phone}</a></div>` : ''}
              ${personal.location ? `<div>${personal.location}</div>` : ''}
              ${personal.linkedin ? `<div><a href="${personal.linkedin}" style="color:white;text-decoration:none" target="_blank">LinkedIn</a></div>` : ''}
            </div>
          </div>
          <div class="executive-body">
            <div class="executive-main">
              ${summaryHTML}
              ${experienceHTML}
              ${projectsHTML}
              ${rightCustomHTML}
            </div>
            <div class="executive-side">
              ${skillsHTML}
              ${educationHTML}
              ${leftCustomHTML}
            </div>
          </div>`;

    } else if (t === 'theme-techno') {
        preview.innerHTML = `
          <div class="techno-header">
            <div>
              <div class="resume-name">${personal.name || 'Your Name'}</div>
              <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
            </div>
            ${photoHTML ? `<div>${photoHTML}</div>` : ''}
          </div>
          <div class="techno-body">
            <div style="display:flex;flex-wrap:wrap;gap:4mm;margin-bottom:4mm;font-size:8.5pt;color:#475569">
              ${personal.email    ? `<span>${icons.email} <a href="mailto:${personal.email}">${personal.email}</a></span>` : ''}
              ${personal.phone    ? `<span>${icons.phone} <a href="tel:${personal.phone}">${personal.phone}</a></span>` : ''}
              ${personal.location ? `<span>${icons.location} ${personal.location}</span>` : ''}
              ${personal.linkedin ? `<span>${icons.linkedin} <a href="${personal.linkedin}" target="_blank">LinkedIn</a></span>` : ''}
              ${personal.github   ? `<span>${icons.github} <a href="${personal.github}" target="_blank">GitHub</a></span>` : ''}
            </div>
            ${summaryHTML}
            ${experienceHTML}
            ${educationHTML}
            ${skillsHTML}
            ${projectsHTML}
            ${leftCustomHTML}
          ${rightCustomHTML}
          </div>`;

    } else if (t === 'theme-elegant') {
        preview.innerHTML = `
          <div class="resume-header">
            ${photoHTML ? `<div style="display:flex;justify-content:center;margin-bottom:4mm">${photoHTML}</div>` : ''}
            <div class="resume-name">${personal.name || 'Your Name'}</div>
            <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
            <div class="elegant-divider">· · ·</div>
            ${contactInlineHTML}
          </div>
          ${summaryHTML}
          ${experienceHTML}
          ${educationHTML}
          ${skillsHTML}
          ${projectsHTML}
          ${leftCustomHTML}
          ${rightCustomHTML}`;

    } else if (t === 'theme-compact') {
        preview.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2mm">
            <div>
              <div class="resume-name">${personal.name || 'Your Name'}</div>
              <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
            </div>
            ${photoHTML}
          </div>
          ${contactInlineHTML}
          <hr class="section-divider">
          ${summaryHTML}
          ${experienceHTML}
          ${educationHTML}
          ${skillsHTML}
          ${projectsHTML}
          ${leftCustomHTML}
          ${rightCustomHTML}`;
    }

    // After rendering, check for page breaks
    setTimeout(updatePageIndicators, 50);

    // Auto save
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        pushToHistory();
        const snapshot = history[historyIndex] || JSON.stringify(resumeData);
        localStorage.setItem('resumeAutosave', snapshot);
    }, 1000);
}

function updatePageIndicators() {
    const preview = document.getElementById('resume-preview');
    const pageSize = resumeData.settings.pageSize || 'a4';
    
    // Remove old indicators
    preview.querySelectorAll('.page-break-indicator').forEach(el => el.remove());
    
    // 297mm in pixels (approx 96 DPI * 297 / 25.4)
    const mmToPx = 3.78; 
    const pageHeightPx = parseInt(PAGE_DIMENSIONS[pageSize].h) * mmToPx;
    
    const contentHeight = preview.scrollHeight;
    if (contentHeight > pageHeightPx) {
        let numPages = Math.ceil(contentHeight / pageHeightPx);
        for (let i = 1; i < numPages; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'page-break-indicator';
            indicator.style.top = (i * pageHeightPx) + 'px';
            indicator.innerHTML = `<span>Page ${i+1} Boundary</span>`;
            preview.appendChild(indicator);
        }
    }
}

// ═════════════════════════════════════════════════════
//  PHOTO
// ═════════════════════════════════════════════════════
// removePhoto already defined above (called from HTML)

// ═════════════════════════════════════════════════════
//  RENDER HELPERS
// ═════════════════════════════════════════════════════
function renderDescription(text) {
    if (!text) return '';
    // Convert links in description
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" style="color:var(--resume-primary)">${url}</a>`);
}

// ═════════════════════════════════════════════════════
//  AI ASSISTANCE
// ═════════════════════════════════════════════════════
const AI_SUMMARIES = [
    (t,n) => `Results-driven ${t} with ${n||'5'}+ years of experience delivering high-impact solutions. Proven track record of leading cross-functional teams, optimizing processes, and exceeding organizational objectives through innovative thinking and technical excellence.`,
    (t,n) => `Dynamic ${t} combining deep technical expertise with strategic business acumen. Skilled at translating complex requirements into scalable solutions, mentoring junior professionals, and driving continuous improvement across the entire development lifecycle.`,
    (t,n) => `Highly motivated ${t} with a passion for building robust, user-centered products. Experienced in Agile environments, stakeholder communication, and delivering projects on time and within budget across diverse industries.`,
    (t,n) => `Detail-oriented Civil Engineer with expertise in structural design, site management, and project coordination. Proficient in AutoCAD and Revit, with a strong focus on sustainable infrastructure and safety compliance.`
];

function aiGenerateSummary() {
    const jobInput = document.getElementById('ai-job-title-input').value.trim() || resumeData.personal.title || 'Professional';
    const years = '5';
    const container = document.getElementById('ai-suggestions');
    container.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem">✨ Generating suggestions…</p>';

    setTimeout(() => {
        container.innerHTML = '';
        AI_SUMMARIES.forEach(fn => {
            const chip = document.createElement('div');
            chip.className = 'ai-suggestion-chip';
            chip.textContent = fn(jobInput, years);
            chip.addEventListener('click', () => {
                document.getElementById('input-summary').value = chip.textContent;
                resumeData.summary = chip.textContent;
                container.innerHTML = '';
                updatePreview();
            });
            container.appendChild(chip);
        });
    }, 900);
}

const AI_SKILLS = {
    default:    ['Communication','Problem Solving','Team Leadership','Project Management','Critical Thinking','Agile / Scrum'],
    frontend:   ['React','Vue.js','TypeScript','HTML5','CSS3','Tailwind CSS','Next.js','Webpack','Jest','Figma'],
    backend:    ['Node.js','Python','Java','REST APIs','GraphQL','PostgreSQL','MongoDB','Redis','Docker','AWS'],
    data:       ['Python','Pandas','NumPy','TensorFlow','SQL','Tableau','Power BI','Machine Learning','R','Apache Spark'],
    design:     ['Figma','Adobe XD','Photoshop','Illustrator','InDesign','UI/UX','Wireframing','Prototyping','Sketch'],
    marketing:  ['SEO','Google Analytics','Content Strategy','Social Media','HubSpot','Email Marketing','A/B Testing','CRM'],
    civil:      ['Structural Analysis','AutoCAD 2D/3D','Revit Architecture','Civil 3D','BIM','Estimation & Costing','Surveying','Geotechnical Engineering','STAAD.Pro','Project Management','Safe Software','Construction Supervision','Roads & Bridges','Reinforced Concrete (RCC)']
};

function aiSuggestSkills() {
    const query = document.getElementById('ai-skills-input').value.toLowerCase();
    let pool = AI_SKILLS.default;
    if (query.includes('front') || query.includes('react') || query.includes('ui')) pool = [...AI_SKILLS.frontend, ...AI_SKILLS.default];
    else if (query.includes('back') || query.includes('server') || query.includes('api')) pool = [...AI_SKILLS.backend, ...AI_SKILLS.default];
    else if (query.includes('data') || query.includes('ml') || query.includes('ai')) pool = [...AI_SKILLS.data, ...AI_SKILLS.default];
    else if (query.includes('design') || query.includes('ux')) pool = [...AI_SKILLS.design, ...AI_SKILLS.default];
    else if (query.includes('market')) pool = [...AI_SKILLS.marketing, ...AI_SKILLS.default];
    else if (query.includes('civil') || query.includes('struc')) pool = [...AI_SKILLS.civil, ...AI_SKILLS.default];

    const container = document.getElementById('ai-skill-chips');
    container.innerHTML = '';
    pool.slice(0, 14).forEach(skill => {
        const chip = document.createElement('span');
        chip.className = 'ai-skill-chip';
        chip.textContent = '+ ' + skill;
        chip.addEventListener('click', () => {
            const current = document.getElementById('input-skills').value;
            const skills = current ? current + ', ' + skill : skill;
            document.getElementById('input-skills').value = skills;
            resumeData.skills = skills;
            chip.remove();
            updatePreview();
        });
        container.appendChild(chip);
    });
}

function aiEnhanceCustomEntry(btn) {
    const entry = btn.closest('.custom-entry');
    const title = entry.querySelector('.ce-title').value || 'item';
    
    document.getElementById('ai-modal').style.display = 'flex';
    const body = document.getElementById('ai-modal-body');
    body.innerHTML = '<p>✨ Generating detail bullets for <strong>' + title + '</strong>...</p><div class="ai-loader"><div></div><div></div><div></div></div>';

    setTimeout(() => {
        const lines = [
            `• Successfully completed comprehensive training and application in ${title}.`,
            `• Demonstrated advanced proficiency and practical application of core concepts.`,
            `• Recognized for outstanding attention to detail and problem-solving capabilities in ${title}.`,
            `• Maintained compliance with all project specifications and standards relevant to ${title}.`,
            `• Optimized workflows and improved team efficiency through advanced knowledge of ${title}.`
        ];
        
        body.innerHTML = `
            <p><strong>Suggestions for ${title}:</strong></p>
            <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:1rem">
                ${lines.map(str => `
                <div class="ai-suggestion-chip" onclick="applyAICustomLine('${escapeHTML(str)}')">
                    ${str}
                </div>
                `).join('')}
            </div>
            <p style="font-size:0.8rem;color:var(--text-dim);margin-top:1rem">Click a suggestion to copy it to your clipboard!</p>
        `;
    }, 1200);
}

function applyAICustomLine(text) {
    const modal = document.getElementById('ai-modal');
    modal.style.display = 'none';
    
    const unescaped = unescapeHTML(text);
    if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(unescaped).then(() => {
            alert('✨ Copied to clipboard! Paste it into your custom line or description.');
        });
    } else {
        prompt('Copy this text manually:', unescaped);
    }
}

function escapeHTML(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
}
function unescapeHTML(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

function aiEnhanceExperience(btn) {

    const item = btn.closest('.list-item');
    const desc = item.querySelector('.item-desc');
    const pos  = item.querySelector('.item-position')?.value || 'Professional';
    const co   = item.querySelector('.item-company')?.value  || 'Company';
    const templates = [
        `• Led cross-functional initiatives at ${co} as ${pos}, delivering measurable improvements in team efficiency.\n• Collaborated with stakeholders to define requirements and implemented scalable solutions ahead of deadline.\n• Mentored junior team members and established best practices that reduced onboarding time by 30%.`,
        `• Managed high-value civil engineering projects at ${co} as ${pos}, ensuring compliance with structural standards and safety codes.\n• Oversaw site operations and coordinated with subcontractors to maintain project timelines and budget.\n• Optimized structural layouts using AutoCAD, resulting in a 15% reduction in material costs.`,
        `• Designed and analyzed complex structural systems as ${pos} for ${co}, utilizing STAAD.Pro and Revit for high-precision modeling.\n• Conducted comprehensive site inspections and prepared detailed technical reports for regulatory approval.\n• Improved project workflow by implementing BIM (Building Information Modeling) standards.`
    ];
    desc.value = templates[Math.floor(Math.random() * templates.length)];
    updatePreview();
}

function aiEnhanceProject(btn) {
    const item = btn.closest('.list-item');
    const desc = item.querySelector('.item-project-desc');
    const name = item.querySelector('.item-project-name')?.value || 'Project';
    desc.value = `• Built ${name} from the ground up using modern technologies, focusing on performance and scalability.\n• Implemented RESTful APIs and optimized database queries, reducing load times by 50%.\n• Deployed on cloud infrastructure with CI/CD pipelines ensuring 99.9% uptime.`;
    updatePreview();
}

// ═════════════════════════════════════════════════════
//  LOCAL PROFILES
// ═════════════════════════════════════════════════════
function saveCurrentProfile() {
    const name = prompt("Enter a name for this profile:", resumeData.personal.name || "My Resume");
    if (!name) return;

    const snapshot = {
        id: 'prof-' + Date.now(),
        profileName: name,
        data: {
            ...resumeData,
            experience: getDynamicItems('experience'),
            education:  getDynamicItems('education'),
            projects:   getDynamicItems('projects'),
            customSections: getCustomSections()
        }
    };

    let profiles = JSON.parse(localStorage.getItem('resume_profiles') || '[]');
    profiles.push(snapshot);
    localStorage.setItem('resume_profiles', JSON.stringify(profiles));
    loadProfileList();
    alert('✅ Profile saved to local storage!');
}

function loadProfileList() {
    const container = document.getElementById('profiles-list');
    if (!container) return;
    const profiles = JSON.parse(localStorage.getItem('resume_profiles') || '[]');
    
    if (profiles.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:2rem">No profiles saved yet.</p>';
        return;
    }

    container.innerHTML = profiles.map(p => `
        <div class="list-item" style="display:flex; justify-content:space-between; align-items:center; padding:1rem">
            <div>
                <strong style="display:block; font-size:1.1rem">${p.profileName}</strong>
                <small style="color:var(--text-dim)">Last saved: ${new Date(parseInt(p.id.split('-')[1])).toLocaleDateString()}</small>
            </div>
            <div style="display:flex; gap:0.5rem">
                <button class="btn btn-secondary" style="padding:0.4rem 0.8rem" onclick="applyProfile('${p.id}')">Load</button>
                <button class="btn-remove" style="color:#ef4444; font-size:1.2rem" onclick="deleteProfile('${p.id}')">×</button>
            </div>
        </div>
    `).join('');
}

function applyProfile(id) {
    const profiles = JSON.parse(localStorage.getItem('resume_profiles') || '[]');
    const profile = profiles.find(p => p.id === id);
    if (profile && confirm(`Switch to "${profile.profileName}"? Current unsaved changes will be lost.`)) {
        mergeResumeData(profile.data);
    }
}

function deleteProfile(id) {
    if (!confirm('Are you sure you want to delete this profile?')) return;
    let profiles = JSON.parse(localStorage.getItem('resume_profiles') || '[]');
    profiles = profiles.filter(p => p.id !== id);
    localStorage.setItem('resume_profiles', JSON.stringify(profiles));
    loadProfileList();
}

// ═════════════════════════════════════════════════════
//  TEXT PARSER / IMPORT (Better LinkedIn/PDF support)
// ═════════════════════════════════════════════════════
function triggerLinkedInAutofill() {
    const text = document.getElementById('import-text-input').value.trim();
    const status = document.getElementById('linkedin-status');
    if (!text) { status.textContent = 'Please paste some profile text first.'; status.className = 'linkedin-status error'; return; }

    status.textContent = '🔍 AI Parsing... (Heuristic Engine v2)';
    status.className = 'linkedin-status';

    // Advanced Regex & Pattern Matching
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = text.match(/(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/);
    const linkedinMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);
    const websiteMatch = text.match(/(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]*)?/i);

    // Name Extraction (Look for first line that isn't a common LinkedIn keyword)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let nameCandidate = lines[0];
    const noiseWords = ['linkedin', 'profile', 'contact', 'about', 'experience', 'education', 'skills'];
    for(let l of lines) {
        if (!noiseWords.some(w => l.toLowerCase().includes(w)) && l.length > 2 && l.length < 50) {
            nameCandidate = l;
            break;
        }
    }

    // Title Extraction (often the line after the name)
    let titleCandidate = lines[1] || '';
    if (titleCandidate.toLowerCase().includes('@') || titleCandidate.match(/\d/)) titleCandidate = '';

    // Summary Extraction (Look for "About" or "Summary" block)
    let summaryMatch = "";
    const lowerText = text.toLowerCase();
    const summaryKeywords = ['about', 'summary', 'profile', 'professional summary'];
    for (let kw of summaryKeywords) {
        let idx = lowerText.indexOf(kw);
        if (idx !== -1) {
            summaryMatch = text.slice(idx + kw.length, idx + 600).trim();
            break;
        }
    }
    if (!summaryMatch) summaryMatch = text.slice(0, 400); // Fallback

    // Advanced Section Block Extraction for Skills, Experience, Education
    let skillsMatch = '';
    let expMatch = '';
    let eduMatch = '';
    
    // Generic block extractor
    const extractSection = (keywords, nextKeywords) => {
        const kStr = keywords.join('|');
        const nextKStr = nextKeywords.join('|');
        const regex = new RegExp(`(?:\\n|^)(?:${kStr})[\\s:-]*\\n([\\s\\S]*?)(?=\\n(?:${nextKStr})[\\s:-]*\\n|$)`, 'i');
        const m = text.match(regex);
        if (m) return m[1].trim();
        // Fallback: search for keyword and take everything until next keyword
        const lowerText = text.toLowerCase();
        for (const kw of keywords) {
            const idx = lowerText.indexOf(kw.toLowerCase());
            if (idx !== -1) {
                let endIdx = text.length;
                for (const nkw of nextKeywords) {
                    const nIdx = lowerText.indexOf(nkw.toLowerCase(), idx + kw.length);
                    if (nIdx !== -1 && nIdx < endIdx) endIdx = nIdx;
                }
                return text.slice(idx + kw.length, endIdx).trim();
            }
        }
        return '';
    };

    const sectionNames = ['Education', 'Experience', 'Skills', 'Projects', 'Certifications', 'Languages', 'Work Experience', 'Employment', 'Academic'];
    skillsMatch = extractSection(['Skills', 'Core Competencies', 'Technical Skills'], sectionNames);
    expMatch = extractSection(['Experience', 'Work Experience', 'Employment History'], sectionNames);
    eduMatch = extractSection(['Education', 'Academic Background', 'Academic History'], sectionNames);

    if (skillsMatch) {
         skillsMatch = skillsMatch.replace(/\n/g, ', ').replace(/, \s*,/g, ',').trim();
    }


    setTimeout(() => {
        linkedInPending = {
            name:     nameCandidate,
            title:    titleCandidate || 'Professional',
            location: text.match(/(?:New York|San Francisco|London|Mumbai|Remote|CA|NY|TX|Dubai|Singapore|Berlin|USA|India|UK|UAE)/i)?.[0] || '',
            email:    emailMatch?.[0] || '',
            phone:    phoneMatch?.[1] || '',
            linkedin: linkedinMatch ? linkedinMatch[0] : '',
            website:  websiteMatch ? websiteMatch[0] : '',
            summary:  (summaryMatch || "").replace(/\n\s*\n/g, '\n').slice(0, 500),
            skills:   skillsMatch || "",
            experience_raw: expMatch || "",
            education_raw: eduMatch || ""
        };
        showLinkedInModal();
        status.textContent = '✓ Analysis complete. Please review the changes in the popup.';
        status.className = 'linkedin-status success';
    }, 1000);
}

function showLinkedInModal() {
    const modal = document.getElementById('linkedin-modal');
    const body  = document.getElementById('linkedin-modal-body');
    const fields = ['name','title','location','email','linkedin','summary', 'skills', 'experience_raw', 'education_raw'];
    const labels = { name:'Full Name', title:'Job Title', location:'Location', email:'Email', linkedin:'LinkedIn URL', summary:'Summary', skills:'Skills', experience_raw:'Work Experience', education_raw:'Education' };

    let sectionsHTML = fields.map(f => {
        let cur = '';
        if (f === 'summary') cur = resumeData.summary || '';
        else if (f === 'skills') cur = resumeData.skills || '';
        else if (f === 'experience_raw') cur = resumeData.experience.length ? '(Existing work entries)' : '';
        else if (f === 'education_raw') cur = resumeData.education.length ? '(Existing education entries)' : '';
        else cur = resumeData.personal[f] || '';

        let nw  = linkedInPending[f] || '';
        const changed = nw && nw !== cur;
        if (!cur && !nw) return '';

        const clearBtn = cur
            ? `<button onclick="clearResumeSection('${f}')" style="background:rgba(255,68,68,0.12);border:1px solid rgba(255,68,68,0.3);color:#f87171;border-radius:0.3rem;padding:2px 8px;font-size:0.7rem;cursor:pointer;font-family:inherit;">&#128465; Clear Current</button>`
            : '';

        const curSafe = cur ? cur.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>') : '<span class="empty-val">Empty</span>';
        const nwSafe  = nw  ? nw .replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

        return `
        <div class="compare-section ${changed ? 'changed' : ''}">
            <div class="compare-header">
                <label style="display:flex;align-items:center;gap:0.65rem;cursor:pointer">
                    <input type="checkbox" class="compare-check" data-field="${f}" ${nw ? 'checked' : ''} style="accent-color:#10b981;width:1.15rem;height:1.15rem;">
                    <span class="compare-label">${labels[f]}</span>
                </label>
                <div style="display:flex;gap:0.4rem;align-items:center">
                    ${changed ? '<span class="compare-badge">Modified</span>' : ''}
                    ${clearBtn}
                </div>
            </div>
            <div class="compare-grid">
                <div class="compare-col current">
                    <div class="col-label">Current in Resume</div>
                    <div class="col-content" id="cur-${f}">${curSafe}</div>
                </div>
                <div class="compare-col new">
                    <div class="col-label">Extracted — Click to edit</div>
                    <textarea class="compare-edit-input" data-field="${f}" id="edit-${f}">${nwSafe}</textarea>
                </div>
            </div>
        </div>`;
    }).join('');

    body.innerHTML = `
        <div class="compare-intro">
            <p>&#9745; Check a field to include it &nbsp;|&nbsp; &#9998; Click the right panel to edit &nbsp;|&nbsp; Use <strong style="color:var(--text-main)">Clear Current</strong> to wipe existing data first.</p>
        </div>
        <div class="compare-list">${sectionsHTML}</div>`;
    modal.style.display = 'flex';
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
            const newItem = addItem('experience');
            if(newItem) {
                newItem.querySelector('.item-company').value = "Imported Parsed Block";
                newItem.querySelector('.item-position').value = "Work History Summary";
                newItem.querySelector('.item-desc').value = val;
            }
        } else if (k === 'education_raw') {
            resumeData.education = [];
            document.getElementById('education-list').innerHTML = '';
            const newItem = addItem('education');
            if(newItem) {
                newItem.querySelector('.item-school').value = "Imported Parsed Block";
                newItem.querySelector('.item-degree').value = "Education Summary";
                newItem.querySelector('.item-desc').value = val;
            }
        } else if (resumeData.personal.hasOwnProperty(k)) {
            resumeData.personal[k] = val;
            const el = document.getElementById('input-' + k);
            if (el) el.value = val;
        }
    });

    closeLinkedInModal();
    updatePreview();
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
            
            // Smarter spacing: group by vertical position
            let lastY, pageText = '';
            for (const item of textContent.items) {
                const currentY = item.transform[5];
                if (lastY !== undefined && Math.abs(lastY - currentY) > 2) {
                    pageText += '\n';
                } else if (lastY !== undefined) {
                    // Check if there's enough horizontal distance for a space
                    pageText += ' ';
                }
                pageText += item.str;
                lastY = currentY;
            }
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
