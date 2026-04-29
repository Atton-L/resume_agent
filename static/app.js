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

// Zoom control
const tableZoomSlider = document.getElementById('tableZoomSlider');
const tableZoomValue = document.getElementById('tableZoomValue');
const candidatesTable = document.getElementById('candidatesTable');

// Column Toggle
const columnToggleBtn = document.getElementById('columnToggleBtn');
const columnToggleMenu = document.getElementById('columnToggleMenu');
const candidatesHeaderRow = document.getElementById('candidatesHeaderRow');
let hiddenColumns = JSON.parse(localStorage.getItem('hiddenColumns')) || [];

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
            uploaderSelect.dispatchEvent(new Event('change'));
        }, 300);
    }

    initColumnToggle();
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

    // 保存选择的上传人 (上传区域)
    uploaderSelect.addEventListener('change', () => {
        if (uploaderSelect.value) {
            localStorage.setItem('lastUploader', uploaderSelect.value);
        }
        const hhInput = document.getElementById('uploaderHeadhunterName');
        if (hhInput) {
            hhInput.style.display = uploaderSelect.value === '猎头' ? 'inline-block' : 'none';
        }
    });

    // 监控编辑模态框里的上传人变化
    const editUploaderSelect = document.getElementById('editUploader');
    if (editUploaderSelect) {
        editUploaderSelect.addEventListener('change', () => {
            const hhInput = document.getElementById('editUploaderHeadhunterName');
            if (hhInput) {
                hhInput.style.display = editUploaderSelect.value === '猎头' ? 'inline-block' : 'none';
            }
        });
    }

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

    // Table zoom slider logic
    if (tableZoomSlider && tableZoomValue && candidatesTable) {
        tableZoomSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            tableZoomValue.textContent = val + '%';
            candidatesTable.style.zoom = val / 100;
        });
    }

    // Column Toggle Click Outside
    if (columnToggleBtn && columnToggleMenu) {
        columnToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            columnToggleMenu.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!columnToggleContainer.contains(e.target)) {
                columnToggleMenu.classList.remove('show');
            }
        });
        columnToggleMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}
const columnToggleContainer = document.querySelector('.column-toggle-container');

function initColumnToggle() {
    if (!candidatesHeaderRow || !columnToggleMenu) return;
    const ths = Array.from(candidatesHeaderRow.querySelectorAll('th'));
    columnToggleMenu.innerHTML = '';

    ths.forEach((th, idx) => {
        // 不允许隐藏前两列(序号/姓名)和最后一列(操作)
        if (idx === 0 || idx === 1 || idx === ths.length - 1) return;

        const label = document.createElement('label');
        label.className = 'column-toggle-label';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !hiddenColumns.includes(idx);
        checkbox.dataset.colIdx = idx;

        checkbox.addEventListener('change', (e) => {
            const colIdx = parseInt(e.target.dataset.colIdx, 10);
            if (e.target.checked) {
                hiddenColumns = hiddenColumns.filter(c => c !== colIdx);
            } else {
                if (!hiddenColumns.includes(colIdx)) hiddenColumns.push(colIdx);
            }
            localStorage.setItem('hiddenColumns', JSON.stringify(hiddenColumns));
            applyColumnVisibility();
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(th.textContent.trim()));
        columnToggleMenu.appendChild(label);
    });

    applyColumnVisibility();
}

function applyColumnVisibility() {
    if (!candidatesTable) return;
    const rows = candidatesTable.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.children;
        Array.from(cells).forEach((cell, idx) => {
            // For cells with colspan (like loading state), don't hide
            if (cell.colSpan > 1) return;
            if (hiddenColumns.includes(idx)) {
                cell.style.display = 'none';
            } else {
                cell.style.display = '';
            }
        });
    });
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

// 导出按钮事件
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        showToast('正在准备导出文件...', 'info');
        window.location.href = `${API_BASE}/export`;
    });
}

// 加载用户列表
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`);
        const data = await response.json();
        users = data.users || [];

        if (!users.includes('猎头')) {
            users.push('猎头');
        }

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

// 填充编辑模态框的上传人下拉框
function populateEditUploaderSelect() {
    const editUploaderSelect = document.getElementById('editUploader');
    if (!editUploaderSelect) return;

    // 保留第一个默认选项
    editUploaderSelect.innerHTML = '<option value="">选择上传人...</option>';

    // 添加预设用户
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        editUploaderSelect.appendChild(option);
    });
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
    let uploader = uploaderSelect.value || '系统';

    if (uploaderSelect.value === '') {
        showToast('请选择上传人', 'error');
        return;
    }

    if (uploader === '猎头') {
        const hhInput = document.getElementById('uploaderHeadhunterName');
        const hhName = hhInput ? hhInput.value.trim() : '';
        if (!hhName) {
            showToast('请填写猎头姓名', 'error');
            return;
        }
        uploader = `猎头-${hhName}`;
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
                <td>${escapeHtml(c.job_title || '-')}</td>
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

        applyColumnVisibility();

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

        // 填充上传人下拉列表
        populateEditUploaderSelect();

        document.getElementById('editId').value = candidate.id;
        document.getElementById('editName').value = candidate.name;

        // 设置上传人
        const editUploaderSelect = document.getElementById('editUploader');
        const editUploaderHeadhunterName = document.getElementById('editUploaderHeadhunterName');
        if (editUploaderSelect) {
            let uploaderValue = candidate.uploader;

            // 针对如果是"猎头-xxx"的情况，将下拉框设为"猎头"，把名字填入输入框
            if (uploaderValue && uploaderValue.startsWith('猎头-')) {
                editUploaderSelect.value = '猎头';
                if (editUploaderHeadhunterName) {
                    editUploaderHeadhunterName.value = uploaderValue.substring(3);
                    editUploaderHeadhunterName.style.display = 'inline-block';
                }
            } else {
                if (uploaderValue && !Array.from(editUploaderSelect.options).some(opt => opt.value === uploaderValue)) {
                    const newOption = document.createElement('option');
                    newOption.value = uploaderValue;
                    newOption.textContent = uploaderValue;
                    editUploaderSelect.appendChild(newOption);
                }
                editUploaderSelect.value = uploaderValue || '';
                if (editUploaderHeadhunterName) {
                    editUploaderHeadhunterName.value = '';
                    editUploaderHeadhunterName.style.display = 'none';
                }
            }
        }

        document.getElementById('editDirection').value = candidate.direction;
        document.getElementById('editJobTitle').value = candidate.job_title || '';
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
            if (candidate.second_interview_date.includes('至')) {
                const parts = candidate.second_interview_date.split('至');
                try {
                    document.getElementById('editSecondInterviewDateStart').value = parts[0] && parts[0].trim() ? parts[0].trim().substring(0, 16).replace(' ', 'T') : '';
                    document.getElementById('editSecondInterviewDateEnd').value = parts[1] && parts[1].trim() ? parts[1].trim().substring(0, 16).replace(' ', 'T') : '';
                } catch(e) {}
            } else {
                try {
                    document.getElementById('editSecondInterviewDateStart').value = candidate.second_interview_date.substring(0, 16).replace(' ', 'T');
                } catch(e) {}
                document.getElementById('editSecondInterviewDateEnd').value = '';
            }
        } else {
            document.getElementById('editSecondInterviewDateStart').value = '';
            document.getElementById('editSecondInterviewDateEnd').value = '';
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
    const editUploaderSelect = document.getElementById('editUploader');
    const editUploaderHeadhunterName = document.getElementById('editUploaderHeadhunterName');

    let finalUploader = editUploaderSelect ? editUploaderSelect.value : undefined;
    if (finalUploader === '猎头' && editUploaderHeadhunterName && editUploaderHeadhunterName.value.trim()) {
        finalUploader = `猎头-${editUploaderHeadhunterName.value.trim()}`;
    } else if (finalUploader === '猎头') {
        showToast('请填写猎头姓名', 'error');
        return;
    }

    const updateData = {
        name: document.getElementById('editName').value,
        uploader: finalUploader,
        direction: document.getElementById('editDirection').value,
        job_title: document.getElementById('editJobTitle').value,
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

    const secondInterviewDateStart = document.getElementById('editSecondInterviewDateStart').value;
    const secondInterviewDateEnd = document.getElementById('editSecondInterviewDateEnd').value;
    if (secondInterviewDateStart && secondInterviewDateEnd) {
        const startStr = secondInterviewDateStart.replace('T', ' ');
        const endStr = secondInterviewDateEnd.replace('T', ' ');
        updateData.second_interview_date = `${startStr} 至 ${endStr}`;
    } else if (secondInterviewDateStart) {
        updateData.second_interview_date = secondInterviewDateStart.replace('T', ' ');
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
