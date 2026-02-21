// State Management
let resumeData = {
    personal: { name: '', email: '', phone: '', location: '', title: '', linkedin: '', github: '' },
    summary: '',
    experience: [],
    education: [],
    skills: '',
    projects: [],
    settings: {
        theme: 'theme-modern',
        font: 'font-inter',
        primaryColor: '#6366f1'
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupEventListeners();
    loadSampleData();
    updatePreview();
});

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.form-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');

            // Update Nav
            navItems.forEach(ni => ni.classList.remove('active'));
            item.classList.add('active');

            // Update Section
            sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(`form-${sectionId}`).classList.add('active');
        });
    });
}

function setupEventListeners() {
    // Sync text inputs
    document.querySelectorAll('.sync-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = e.target.id.replace('input-', '');
            if (id === 'name' || id === 'email' || id === 'phone' || id === 'location' || id === 'title' || id === 'linkedin' || id === 'github') {
                resumeData.personal[id] = e.target.value;
            } else if (id === 'summary') {
                resumeData.summary = e.target.value;
            } else if (id === 'skills') {
                resumeData.skills = e.target.value;
            } else if (id === 'font') {
                resumeData.settings.font = e.target.value;
            }
            updatePreview();
        });
    });

    // Theme Selection
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            resumeData.settings.theme = card.getAttribute('data-theme');
            updatePreview();
        });
    });

    // Color Picker
    document.getElementById('setting-color').addEventListener('input', (e) => {
        resumeData.settings.primaryColor = e.target.value;
        updatePreview();
    });

    // Export PDF
    document.getElementById('download-pdf').addEventListener('click', exportPDF);
}

function addItem(type) {
    const list = document.getElementById(`${type}-list`);
    const tmpl = document.getElementById(`tmpl-${type}`).content.cloneNode(true);
    const id = Date.now().toString();
    tmpl.querySelector('.list-item').setAttribute('data-id', id);
    list.appendChild(tmpl);
    updatePreview();
}

function removeItem(btn) {
    btn.closest('.list-item').remove();
    updatePreview();
}

function getDynamicItems(type) {
    const items = [];
    const listItems = document.querySelectorAll(`#${type}-list .list-item`);

    listItems.forEach(el => {
        const item = {};
        el.querySelectorAll('input, textarea').forEach(input => {
            const key = input.className.replace('item-', '').replace('-', '');
            item[key] = input.value;
        });
        items.push(item);
    });
    return items;
}

function updatePreview() {
    const preview = document.getElementById('resume-preview');
    const { personal, summary, settings } = resumeData;
    const experience = getDynamicItems('experience');
    const education = getDynamicItems('education');
    const projects = getDynamicItems('projects');

    // Apply Settings
    preview.className = `resume-paper ${settings.theme} ${settings.font}`;
    preview.style.setProperty('--resume-primary', settings.primaryColor);

    let html = '';

    if (settings.theme === 'theme-modern') {
        html = `
            <div class="resume-sidebar">
                <div class="contact-info">
                    <div class="section-title">Contact</div>
                    ${personal.email ? `<div class="contact-item">📧 ${personal.email}</div>` : ''}
                    ${personal.phone ? `<div class="contact-item">📱 ${personal.phone}</div>` : ''}
                    ${personal.location ? `<div class="contact-item">📍 ${personal.location}</div>` : ''}
                    ${personal.linkedin ? `<div class="contact-item">🔗 LinkedIn</div>` : ''}
                    ${personal.github ? `<div class="contact-item">💻 Portfolio</div>` : ''}
                </div>

                <div class="skills-section" style="margin-top: 10mm">
                    <div class="section-title">Skills</div>
                    <div class="skills-list">
                        ${resumeData.skills.split(',').map(s => s.trim() ? `<span class="skill-tag">${s.trim()}</span>` : '').join('')}
                    </div>
                </div>
            </div>
            <div class="resume-main">
                <h1 class="resume-name">${personal.name || 'Your Name'}</h1>
                <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
                
                ${summary ? `
                    <div class="section-title">Profile</div>
                    <p style="margin-bottom: 8mm">${summary}</p>
                ` : ''}

                ${experience.length ? `
                    <div class="section-title">Experience</div>
                    ${experience.map(exp => `
                        <div class="experience-item">
                            <div class="item-meta">
                                <span>${exp.position || 'Position'}</span>
                                <span>${exp.duration || 'Date'}</span>
                            </div>
                            <div class="item-submeta">
                                <span>${exp.company || 'Company'}</span>
                                <span>${exp.city || 'Location'}</span>
                            </div>
                            <div class="item-description">${exp.desc || ''}</div>
                        </div>
                    `).join('')}
                ` : ''}

                ${education.length ? `
                    <div class="section-title">Education</div>
                    ${education.map(edu => `
                        <div class="education-item">
                            <div class="item-meta">
                                <span>${edu.school || 'Institution'}</span>
                                <span>${edu.year || 'Year'}</span>
                            </div>
                            <div class="item-submeta">
                                <span>${edu.degree || 'Degree'}</span>
                                <span>${edu.score || ''}</span>
                            </div>
                        </div>
                    `).join('')}
                ` : ''}
            </div>
        `;
    } else {
        // Simple Top-Down for Minimal/Professional
        html = `
            <div class="resume-header">
                <h1 class="resume-name">${personal.name || 'Your Name'}</h1>
                <div class="resume-job-title">${personal.title || 'Professional Title'}</div>
                <div style="display:flex; gap:4mm; justify-content:center; font-size:9pt; flex-wrap:wrap">
                    ${personal.email ? `<span>${personal.email}</span>` : ''}
                    ${personal.phone ? `<span>${personal.phone}</span>` : ''}
                    ${personal.location ? `<span>${personal.location}</span>` : ''}
                </div>
            </div>

            ${summary ? `
                <div class="section-title">Summary</div>
                <p>${summary}</p>
            ` : ''}

            ${experience.length ? `
                <div class="section-title">Experience</div>
                ${experience.map(exp => `
                    <div class="experience-item">
                        <div class="item-meta">
                            <span>${exp.position}</span>
                            <span>${exp.duration}</span>
                        </div>
                        <div class="item-submeta">
                            <span>${exp.company}</span>
                            <span>${exp.city}</span>
                        </div>
                        <div class="item-description">${exp.desc}</div>
                    </div>
                `).join('')}
            ` : ''}

            <div class="section-title">Skills</div>
            <p>${resumeData.skills}</p>

            ${education.length ? `
                <div class="section-title">Education</div>
                ${education.map(edu => `
                    <div class="education-item">
                        <div class="item-meta">
                            <span>${edu.school}</span>
                            <span>${edu.year}</span>
                        </div>
                        <div class="item-submeta">
                            <span>${edu.degree}</span>
                            <span>${edu.score}</span>
                        </div>
                    </div>
                `).join('')}
            ` : ''}
        `;
    }

    preview.innerHTML = html;
}

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const canvas = await html2canvas(document.getElementById('resume-preview'), {
        scale: 2,
        useCORS: true,
        logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${resumeData.personal.name || 'resume'}.pdf`);
}

function loadSampleData() {
    resumeData.personal = {
        name: 'Alexander Sterling',
        email: 'alex.sterling@techmail.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        title: 'Senior Software Architect',
        linkedin: 'linkedin.com/in/alexsterling',
        github: 'github.com/alexsterling'
    };
    resumeData.summary = 'Passionate Software Architect with 10+ years of experience in building scalable distributed systems. Expert in cloud-native technologies and AI integration.';
    resumeData.skills = 'JavaScript, TypeScript, React, Node.js, AWS, Kubernetes, GraphQL, System Design, Python, TensorFlow';

    // Populate Inputs
    document.getElementById('input-name').value = resumeData.personal.name;
    document.getElementById('input-email').value = resumeData.personal.email;
    document.getElementById('input-phone').value = resumeData.personal.phone;
    document.getElementById('input-location').value = resumeData.personal.location;
    document.getElementById('input-title').value = resumeData.personal.title;
    document.getElementById('input-summary').value = resumeData.summary;
    document.getElementById('input-skills').value = resumeData.skills;

    // Add one experience
    addItem('experience');
    const firstExp = document.querySelector('#experience-list .list-item');
    firstExp.querySelector('.item-company').value = 'TechNova Solutions';
    firstExp.querySelector('.item-position').value = 'Lead Engineer';
    firstExp.querySelector('.item-duration').value = '2020 - Present';
    firstExp.querySelector('.item-city').value = 'Remote';
    firstExp.querySelector('.item-desc').value = '- Led the migration of monolithic architecture to microservices.\n- Improved system performance by 40%.\n- Mentored a team of 15 developers.';

    // Add one education
    addItem('education');
    const firstEdu = document.querySelector('#education-list .list-item');
    firstEdu.querySelector('.item-school').value = 'Massachusetts Institute of Technology';
    firstEdu.querySelector('.item-degree').value = 'M.Sc. in Computer Science';
    firstEdu.querySelector('.item-year').value = '2016';
    firstEdu.querySelector('.item-score').value = 'GPA 4.0/4.0';
}
