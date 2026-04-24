// 简历管理Agent - 前端逻辑

// API 基础路径
const API_BASE = '/api';

// DOM 元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploaderSelect = document.getElementById('uploader');
const candidatesBody = document.getElementById('candidatesBody');
const refreshBtn = document.getElementById('refreshBtn');
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const closeModalBtn = document.getElementById('closeModal');
const cancelEditBtn = document.getElementById('cancelEdit');
const toast = document.getElementById('toast');
const statsSearchBtn = document.getElementById('statsSearchBtn');
const statsResetBtn = document.getElementById('statsResetBtn');
const statsStartDate = document.getElementById('statsStartDate');
const statsEndDate = document.getElementById('statsEndDate');
const statsUploader = document.getElementById('statsUploader');
const nameSearchInput = document.getElementById('nameSearchInput');
const nameSearchBtn = document.getElementById('nameSearchBtn');
const namePrevBtn = document.getElementById('namePrevBtn');
const nameNextBtn = document.getElementById('nameNextBtn');
const nameClearBtn = document.getElementById('nameClearBtn');
const nameSearchCount = document.getElementById('nameSearchCount');
const nameSearchPreview = document.getElementById('nameSearchPreview');
const nameSearchPreviewList = document.getElementById('nameSearchPreviewList');

// 用户列表
let users = [];
let currentNameKeyword = '';
let matchedNameRows = [];
let currentMatchIndex = -1;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadCandidates();
    loadStats();
    setupEventListeners();
    // 恢复上次选择的上传人
    const lastUploader = localStorage.getItem('lastUploader');
    if (lastUploader) {
        setTimeout(() => {
            uploaderSelect.value = lastUploader;
        }, 300);
    }
});

// 设置事件监听
function setupEventListeners() {
    // 上传区域点击
    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.classList.contains('upload-icon') ||
            e.target.tagName === 'H3' || e.target.tagName === 'P') {
            fileInput.click();
        }
    });

    // 上传按钮
    uploadBtn.addEventListener('click', () => fileInput.click());

    // 文件选择
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // 刷新按钮
    refreshBtn.addEventListener('click', () => {
        loadCandidates();
        loadStats();
    });

    // 编辑模态框关闭
    closeModalBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);

    // 点击模态框外部关闭
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
            closeEditModal();
        }
    });

    // 表单提交
    editForm.addEventListener('submit', handleEditSubmit);

    // 保存选择的上传人
    uploaderSelect.addEventListener('change', () => {
        if (uploaderSelect.value) {
            localStorage.setItem('lastUploader', uploaderSelect.value);
        }
    });

    // 统计筛选
    if (statsSearchBtn) {
        statsSearchBtn.addEventListener('click', () => {
            loadStats(getStatsFilters());
        });
    }

    if (statsResetBtn) {
        statsResetBtn.addEventListener('click', () => {
            if (statsStartDate) statsStartDate.value = '';
            if (statsEndDate) statsEndDate.value = '';
            if (statsUploader) statsUploader.value = '';
            loadStats();
        });
    }

    if (nameSearchBtn) {
        nameSearchBtn.addEventListener('click', () => performNameSearch());
    }
    if (namePrevBtn) {
        namePrevBtn.addEventListener('click', () => gotoPrevNameMatch());
    }
    if (nameNextBtn) {
        nameNextBtn.addEventListener('click', () => gotoNextNameMatch());
    }
    if (nameClearBtn) {
        nameClearBtn.addEventListener('click', clearNameSearch);
    }
    if (nameSearchInput) {
        nameSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performNameSearch();
            }
        });
    }
}

function updateNameSearchCount() {
    if (!nameSearchCount) return;
    if (!matchedNameRows.length || currentMatchIndex < 0) {
        nameSearchCount.textContent = `0/${matchedNameRows.length}`;
        return;
    }
    nameSearchCount.textContent = `${currentMatchIndex + 1}/${matchedNameRows.length}`;
}

function renderNamePreview() {
    if (!nameSearchPreview || !nameSearchPreviewList) return;

    if (!matchedNameRows.length) {
        nameSearchPreviewList.innerHTML = '<div class="name-search-preview-empty">未找到匹配结果</div>';
        nameSearchPreview.hidden = false;
        return;
    }

    nameSearchPreview.hidden = false;
    nameSearchPreviewList.innerHTML = matchedNameRows.map((row, idx) => {
        const cells = row.querySelectorAll('td');
        const seq = cells[0] ? cells[0].textContent.trim() : '-';
        const name = row.dataset.candidateName || (cells[1] ? cells[1].textContent.trim() : '');
        const uploadDate = cells[4] ? cells[4].textContent.trim() : '-';
        const uploader = cells[5] ? cells[5].textContent.trim() : '-';
        const activeClass = idx === currentMatchIndex ? ' active' : '';
        return `<button type="button" class="name-search-preview-item${activeClass}" data-preview-index="${idx}">
            <span class="preview-main">${escapeHtml(name)} <em>#${escapeHtml(seq)}</em></span>
            <span class="preview-sub">${escapeHtml(uploadDate)} | ${escapeHtml(uploader)}</span>
        </button>`;
    }).join('');

    const previewItems = nameSearchPreviewList.querySelectorAll('.name-search-preview-item');
    previewItems.forEach((item) => {
        item.addEventListener('click', () => {
            const idx = Number(item.dataset.previewIndex);
            if (Number.isNaN(idx)) return;
            currentMatchIndex = idx;
            focusCurrentMatch(true);
            renderNamePreview();
        });
    });
}

function clearNameHighlights() {
    const rows = candidatesBody.querySelectorAll('tr');
    rows.forEach((row) => {
        row.classList.remove('name-match-row', 'active-name-match');
    });
}

function applyNameHighlights() {
    clearNameHighlights();
    matchedNameRows.forEach((row, idx) => {
        row.classList.add('name-match-row');
        if (idx === currentMatchIndex) {
            row.classList.add('active-name-match');
        }
    });
    updateNameSearchCount();
}

function collectNameMatches(keyword) {
    const normalized = (keyword || '').trim().toLowerCase();
    const rows = Array.from(candidatesBody.querySelectorAll('tr[data-candidate-name]'));
    if (!normalized) {
        matchedNameRows = [];
        currentMatchIndex = -1;
        applyNameHighlights();
        return;
    }

    matchedNameRows = rows.filter((row) => {
        const name = (row.dataset.candidateName || '').toLowerCase();
        return name.includes(normalized);
    });

    currentMatchIndex = matchedNameRows.length > 0 ? 0 : -1;
    applyNameHighlights();
    renderNamePreview();
}

function focusCurrentMatch(allowScroll = false) {
    if (currentMatchIndex < 0 || !matchedNameRows[currentMatchIndex]) {
        return;
    }
    const row = matchedNameRows[currentMatchIndex];
    if (allowScroll) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    applyNameHighlights();
}

function performNameSearch() {
    currentNameKeyword = nameSearchInput ? nameSearchInput.value.trim() : '';
    collectNameMatches(currentNameKeyword);
    if (!matchedNameRows.length && currentNameKeyword) {
        showToast(`未找到姓名包含“${currentNameKeyword}”的记录`, 'info');
        return;
    }
    // 搜索后仅显示预览，不自动跳转
}

function gotoPrevNameMatch() {
    if (!matchedNameRows.length) return;
    currentMatchIndex = (currentMatchIndex - 1 + matchedNameRows.length) % matchedNameRows.length;
    applyNameHighlights();
    renderNamePreview();
}

function gotoNextNameMatch() {
    if (!matchedNameRows.length) return;
    currentMatchIndex = (currentMatchIndex + 1) % matchedNameRows.length;
    applyNameHighlights();
    renderNamePreview();
}

function clearNameSearch() {
    currentNameKeyword = '';
    if (nameSearchInput) nameSearchInput.value = '';
    matchedNameRows = [];
    currentMatchIndex = -1;
    applyNameHighlights();
    if (nameSearchPreviewList) {
        nameSearchPreviewList.innerHTML = '';
    }
    if (nameSearchPreview) {
        nameSearchPreview.hidden = true;
    }
}

// 加载用户列表
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`);
        const data = await response.json();
        users = data.users || [];

        // 填充下拉框
        uploaderSelect.innerHTML = '<option value="">选择上传人...</option>';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user;
            uploaderSelect.appendChild(option);
        });

        if (statsUploader) {
            const previousStatsUploader = statsUploader.value;
            statsUploader.innerHTML = '<option value="">全部上传人</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user;
                option.textContent = user;
                statsUploader.appendChild(option);
            });

            if (previousStatsUploader && users.includes(previousStatsUploader)) {
                statsUploader.value = previousStatsUploader;
            }
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
    }
}

// 处理文件选择
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

// 处理文件上传
async function handleFileUpload(file) {
    const uploader = uploaderSelect.value || '系统';

    if (uploaderSelect.value === '') {
        showToast('请选择上传人', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('uploader', uploader);

    showToast('正在上传并AI分析简历...', 'info');

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showToast(`简历上传成功！AI分析完成，${result.message}`, 'success');
            loadCandidates();
            loadStats();
        } else {
            showToast(result.message || '上传失败', 'error');
        }
    } catch (error) {
        showToast('上传失败：' + error.message, 'error');
    }

    // 清空文件选择
    fileInput.value = '';
}

// 加载应聘者列表
async function loadCandidates() {
    candidatesBody.innerHTML = '<tr><td colspan="17" class="loading">加载中...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/candidates`);
        const candidates = await response.json();

        if (candidates.length === 0) {
            candidatesBody.innerHTML = '<tr><td colspan="17" style="text-align:center;color:#666;padding:40px;">暂无应聘者数据</td></tr>';
            clearNameSearch();
            return;
        }

        candidatesBody.innerHTML = candidates.map(c => {
            const fileExt = getFileExtension(c.resume_file);
            const canPreview = fileExt === '.pdf';

            return `
            <tr data-candidate-name="${escapeHtml(c.name || '')}">
                <td>${c.id}</td>
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>
                    <div class="resume-actions">
                        <span class="resume-filename">${escapeHtml(c.resume_file)}</span>
                        <div class="resume-buttons">
                            ${canPreview ? `<button class="btn-link btn-preview" onclick="previewResume(${c.id})" title="预览">👁️</button>` : ''}
                            <button class="btn-link btn-download" onclick="downloadResume(${c.id})" title="下载">📥</button>
                        </div>
                    </div>
                </td>
                <td>${getDirectionBadge(c.direction)}</td>
                <td>${c.upload_date}</td>
                <td>${escapeHtml(c.uploader)}</td>
                <td>${escapeHtml(c.work_base || '-')}</td>
                <td>${getInterviewStatus(c.can_interview)}</td>
                <td>${escapeHtml(c.interview_owner || '-')}</td>
                <td>${escapeHtml(c.interview_date || '-')}</td>
                <td>${escapeHtml(c.interviewer || '-')}</td>
                <td>${escapeHtml(c.first_interview_review || '-')}</td>
                <td>${escapeHtml(c.first_interview_conclusion || '-')}</td>
                <td>${escapeHtml(c.second_interview_date || '-')}</td>
                <td>${escapeHtml(c.second_interview_conclusion || '-')}</td>
                <td>${escapeHtml(c.recruitment_status || '-')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-secondary" onclick="openEditModal(${c.id})">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCandidate(${c.id})">删除</button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');

        if (nameSearchInput && currentNameKeyword) {
            nameSearchInput.value = currentNameKeyword;
            collectNameMatches(currentNameKeyword);
        } else {
            clearNameHighlights();
            updateNameSearchCount();
            if (nameSearchPreview) nameSearchPreview.hidden = true;
        }

    } catch (error) {
        candidatesBody.innerHTML = '<tr><td colspan="17" style="text-align:center;color:#C00000;">加载失败：' + error.message + '</td></tr>';
        clearNameSearch();
    }
}

// 获取统计筛选条件
function getStatsFilters() {
    return {
        start_date: statsStartDate ? statsStartDate.value : '',
        end_date: statsEndDate ? statsEndDate.value : '',
        uploader: statsUploader ? statsUploader.value : ''
    };
}

// 加载统计信息
async function loadStats(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.start_date) params.set('start_date', filters.start_date);
        if (filters.end_date) params.set('end_date', filters.end_date);
        if (filters.uploader) params.set('uploader', filters.uploader);

        const url = params.toString() ? `${API_BASE}/stats?${params.toString()}` : `${API_BASE}/stats`;
        const response = await fetch(url);
        const stats = await response.json();

        if (!response.ok) {
            throw new Error(stats.detail || '统计接口请求失败');
        }

        document.getElementById('totalCandidates').textContent = stats.total_in_range ?? stats.total ?? 0;
        document.getElementById('androidCount').textContent = stats.by_direction?.Android ?? 0;
        document.getElementById('linuxCount').textContent = stats.by_direction?.Linux ?? 0;
        document.getElementById('qnxCount').textContent = stats.by_direction?.QNX ?? 0;
        document.getElementById('canInterviewCount').textContent = stats.can_interview ?? 0;

        const uploaderUploadCountEl = document.getElementById('uploaderUploadCount');
        const firstInterviewPassCountEl = document.getElementById('firstInterviewPassCount');
        const secondInterviewCountEl = document.getElementById('secondInterviewCount');
        const onboardingCountEl = document.getElementById('onboardingCount');

        if (uploaderUploadCountEl) uploaderUploadCountEl.textContent = stats.uploader_upload_count ?? 0;
        if (firstInterviewPassCountEl) firstInterviewPassCountEl.textContent = stats.first_interview_pass_count ?? 0;
        if (secondInterviewCountEl) secondInterviewCountEl.textContent = stats.second_interview_count ?? 0;
        if (onboardingCountEl) onboardingCountEl.textContent = stats.onboarding_count ?? 0;

    } catch (error) {
        console.error('加载统计信息失败:', error);
        showToast('加载统计信息失败：' + error.message, 'error');
    }
}

// 获取文件扩展名
function getFileExtension(filename) {
    const idx = filename.lastIndexOf('.');
    return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

// 预览简历
function previewResume(id) {
    const previewUrl = `${API_BASE}/preview/resume/${id}`;
    window.open(previewUrl, '_blank', 'width=900,height=700');
}

// 下载简历
function downloadResume(id) {
    window.location.href = `${API_BASE}/download/resume/${id}`;
}

// 获取方向标签
function getDirectionBadge(direction) {
    const className = {
        'Android': 'direction-android',
        'Linux': 'direction-linux',
        'QNX': 'direction-qnx'
    }[direction] || 'direction-unknown';

    return `<span class="direction-badge ${className}">${escapeHtml(direction || '未确定')}</span>`;
}

// 获取面试状态
function getInterviewStatus(status) {
    if (!status) return '-';
    if (status === '是') return '<span style="color:#70AD47;">是</span>';
    if (status === '否') return '<span style="color:#C00000;">否</span>';
    return `<span style="color:#FFC000;">${escapeHtml(status)}</span>`;
}

// 打开编辑模态框
async function openEditModal(id) {
    try {
        const response = await fetch(`${API_BASE}/candidates/${id}`);
        const candidate = await response.json();

        document.getElementById('editId').value = candidate.id;
        document.getElementById('editName').value = candidate.name;
        document.getElementById('editDirection').value = candidate.direction;
        document.getElementById('editWorkBase').value = candidate.work_base || '';
        document.getElementById('editCanInterview').value = candidate.can_interview || '';
        document.getElementById('editInterviewOwner').value = candidate.interview_owner || '';
        document.getElementById('editInterviewer').value = candidate.interviewer || '';
        document.getElementById('editFirstInterviewReview').value = candidate.first_interview_review || '';
        document.getElementById('editFirstInterviewConclusion').value = candidate.first_interview_conclusion || '';
        document.getElementById('editSecondInterviewConclusion').value = candidate.second_interview_conclusion || '';
        document.getElementById('editRecruitmentStatus').value = candidate.recruitment_status || '';

        // 处理日期时间格式
        if (candidate.interview_date) {
            if (candidate.interview_date.includes('至')) {
                const parts = candidate.interview_date.split('至');
                try {
                    document.getElementById('editInterviewDateStart').value = parts[0] && parts[0].trim() ? parts[0].trim().substring(0, 16).replace(' ', 'T') : '';
                    document.getElementById('editInterviewDateEnd').value = parts[1] && parts[1].trim() ? parts[1].trim().substring(0, 16).replace(' ', 'T') : '';
                } catch(e) {}
            } else {
                try {
                    document.getElementById('editInterviewDateStart').value = candidate.interview_date.substring(0, 16).replace(' ', 'T');
                } catch(e) {}
                document.getElementById('editInterviewDateEnd').value = '';
            }
        } else {
            document.getElementById('editInterviewDateStart').value = '';
            document.getElementById('editInterviewDateEnd').value = '';
        }
        if (candidate.second_interview_date) {
            document.getElementById('editSecondInterviewDate').value = candidate.second_interview_date.substring(0, 16).replace(' ', 'T');
        } else {
            document.getElementById('editSecondInterviewDate').value = '';
        }

        editModal.classList.add('active');

    } catch (error) {
        showToast('获取应聘者信息失败：' + error.message, 'error');
    }
}

// 关闭编辑模态框
function closeEditModal() {
    editModal.classList.remove('active');
    editForm.reset();
}

// 处理编辑提交
async function handleEditSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('editId').value;
    const updateData = {
        name: document.getElementById('editName').value,
        direction: document.getElementById('editDirection').value,
        work_base: document.getElementById('editWorkBase').value,
        can_interview: document.getElementById('editCanInterview').value,
        interview_owner: document.getElementById('editInterviewOwner').value,
        interviewer: document.getElementById('editInterviewer').value,
        first_interview_review: document.getElementById('editFirstInterviewReview').value,
        first_interview_conclusion: document.getElementById('editFirstInterviewConclusion').value,
        second_interview_conclusion: document.getElementById('editSecondInterviewConclusion').value,
        recruitment_status: document.getElementById('editRecruitmentStatus').value
    };

    const interviewDateStart = document.getElementById('editInterviewDateStart').value;
    const interviewDateEnd = document.getElementById('editInterviewDateEnd').value;
    if (interviewDateStart && interviewDateEnd) {
        const startStr = interviewDateStart.replace('T', ' ');
        const endStr = interviewDateEnd.replace('T', ' ');
        updateData.interview_date = `${startStr} 至 ${endStr}`;
    } else if (interviewDateStart) {
        updateData.interview_date = interviewDateStart.replace('T', ' ');
    } else {
        updateData.interview_date = '';
    }

    const secondInterviewDate = document.getElementById('editSecondInterviewDate').value;
    if (secondInterviewDate) {
        updateData.second_interview_date = secondInterviewDate.replace('T', ' ');
    } else {
        updateData.second_interview_date = '';
    }

    try {
        const response = await fetch(`${API_BASE}/candidates/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        if (response.ok) {
            showToast('更新成功', 'success');
            closeEditModal();
            loadCandidates();
            loadStats();
        } else {
            const error = await response.json();
            showToast(error.detail || '更新失败', 'error');
        }
    } catch (error) {
        showToast('更新失败：' + error.message, 'error');
    }
}

// 删除应聘者
async function deleteCandidate(id) {
    if (!confirm('确定要删除这位应聘者吗？此操作不可恢复。')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/candidates/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('删除成功', 'success');
            loadCandidates();
            loadStats();
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败：' + error.message, 'error');
    }
}

// 显示提示消息
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// HTML转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
