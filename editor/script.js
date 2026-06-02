let siteData = {
    pages: [],
    settings: {
        bgColor: { r: 19, g: 10, b: 145 },
        titleFont: { family: 'Microsoft YaHei', size: 32, color: '#ffffff' },
        contentFont: { family: 'Microsoft YaHei', size: 16, color: '#ffffff' },
        noteFont: { family: 'Microsoft YaHei', size: 14, color: '#cccccc' },
        captionFont: { family: 'Microsoft YaHei', size: 12, color: '#cccccc' },
        shadowDivisor: 20,
        shadowOpacity: 0.35
    }
};

let currentPage = null;
let currentImageTarget = null;
let isResizingRow = false;
let resizingRow = null;
let startY, startHeight;

document.addEventListener('DOMContentLoaded', function() {
    loadData();
    preloadEditorAspectRatios();
    renderTree();
    applySettings();
    setupImagePicker();
    setupRowResize();
    window.addEventListener('resize', () => applyCellShadows());
});

function loadData() {
    const saved = localStorage.getItem('siteData');
    if (saved) {
        siteData = JSON.parse(saved);
    }
}

// Preload missing aspect ratios for legacy image data
function preloadEditorAspectRatios() {
    (siteData.pages || []).forEach(page => {
        (page.blocks || []).forEach(block => {
            (block.rows || []).forEach(row => {
                (row.cells || []).forEach(cell => {
                    if (cell.type !== 'text' && cell.src && !cell.aspectRatio) {
                        const img = new Image();
                        img.onload = function() {
                            cell.aspectRatio = img.naturalWidth / img.naturalHeight;
                        };
                        img.onerror = function() {
                            cell.aspectRatio = 1.33;
                        };
                        img.src = cell.src;
                    }
                });
            });
        });
    });
}

function saveData() {
    localStorage.setItem('siteData', JSON.stringify(siteData));
}

function renderTree() {
    const nav = document.getElementById('treeNav');
    
    if (siteData.pages.length === 0) {
        nav.innerHTML = '<div style="padding:20px;color:rgba(255,255,255,0.4);text-align:center;">暂无页面，点击下方按钮添加</div>';
        return;
    }
    
    nav.innerHTML = siteData.pages.map(page => `
        <div class="tree-item">
            <div class="tree-node" onclick="selectPage('${page.id}')" data-page="${page.id}">
                <svg class="tree-icon" viewBox="0 0 24 24">
                    <path d="M3 21h18M3 10h18M5 6l7-3 7 3"/>
                </svg>
                <span class="tree-label">${page.name}</span>
                <div class="tree-actions">
                    <button class="tree-action-btn" onclick="event.stopPropagation(); addBlockToPage('${page.id}')" title="添加区块">+</button>
                    <button class="tree-action-btn" onclick="event.stopPropagation(); deletePage('${page.id}')" title="删除页面">×</button>
                </div>
            </div>
            <div class="tree-children" id="children-${page.id}">
                ${page.blocks && page.blocks.map(block => `
                    <div class="tree-node child-node" onclick="event.stopPropagation(); selectBlockInPage('${page.id}', '${block.id}')">
                        <svg class="tree-icon" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="7" height="7"/>
                            <rect x="14" y="3" width="7" height="7"/>
                            <rect x="14" y="14" width="7" height="7"/>
                            <rect x="3" y="14" width="7" height="7"/>
                        </svg>
                        <span class="tree-label">${block.label}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function selectPage(pageId) {
    currentPage = pageId;
    
    document.querySelectorAll('.tree-node[data-page]').forEach(n => n.classList.remove('active'));
    document.querySelector(`.tree-node[data-page="${pageId}"]`).classList.add('active');
    
    const children = document.getElementById(`children-${pageId}`);
    children.classList.toggle('expanded');
    
    renderPageContent(pageId);
}

function selectBlockInPage(pageId, blockId) {
    currentPage = pageId;
    const children = document.getElementById(`children-${pageId}`);
    if (!children.classList.contains('expanded')) {
        children.classList.add('expanded');
    }
    
    document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('active'));
    document.querySelectorAll(`.tree-node[data-page="${pageId}"]`).forEach(n => n.classList.add('active'));
    
    renderPageContent(pageId);
    
    setTimeout(() => {
        const el = document.querySelector(`[data-block-id="${blockId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('selected');
        }
    }, 100);
}

function renderPageContent(pageId) {
    const area = document.getElementById('contentArea');
    const page = siteData.pages.find(p => p.id === pageId);
    
    if (!page) {
        area.innerHTML = '<div class="empty-state"><p>从左侧选择一个页面开始编辑</p></div>';
        return;
    }
    
    area.innerHTML = `
        <div class="content-page active" id="page-content-${pageId}">
            ${page.blocks && page.blocks.length > 0 
                ? page.blocks.map((block, index) => renderBlock(block, pageId, index)).join('')
                : '<div class="empty-state"><p>点击左侧"+"按钮或下方按钮添加区块</p></div>'
            }
            <div class="block" style="border-style:dashed;min-height:80px;" onclick="addBlockToPage('${pageId}')">
                <div style="text-align:center;padding:30px;color:rgba(255,255,255,0.4);cursor:pointer;">
                    <span style="font-size:24px;">+</span>
                    <p style="margin-top:8px;font-size:13px;">添加区块</p>
                </div>
            </div>
        </div>
    `;
    
    initDragAndDrop();
    initRowResizers();
    requestAnimationFrame(() => applyCellShadows());
}

function renderBlock(block, pageId, index) {
    return `
        <div class="block" data-block-id="${block.id}" draggable="true">
            <div class="block-header">
                <span class="block-title" ondblclick="editBlockTitle('${pageId}', '${block.id}', this)">${block.label}</span>
                <div class="block-actions">
                    <button class="block-btn" onclick="addRowToBlock('${pageId}', '${block.id}')" title="添加行">+行</button>
                    <button class="block-btn" onclick="moveBlock('${pageId}', '${block.id}', -1)" title="上移">↑</button>
                    <button class="block-btn" onclick="moveBlock('${pageId}', '${block.id}', 1)" title="下移">↓</button>
                    <button class="block-btn delete" onclick="deleteBlock('${pageId}', '${block.id}')" title="删除">×</button>
                </div>
            </div>
            <div class="block-body">
                <div class="block-rows">
                    ${(block.rows || []).map((row, rowIndex) => renderRow(block, row, pageId, rowIndex)).join('')}
                </div>
                <div class="add-row-btn" onclick="addRowToBlock('${pageId}', '${block.id}')">
                    + 新增一行
                </div>
            </div>
        </div>
    `;
}

function getCellFlex(cell) {
    if (cell.type === 'text') return 1;
    if (cell.type === 'model') return 1.5;
    if (cell.aspectRatio) return cell.aspectRatio;
    return 1.33;
}

function renderRow(block, row, pageId, rowIndex) {
    const height = row.height || 200;
    return `
        <div class="block-row" data-row-index="${rowIndex}" style="min-height: ${height}px;">
            <div class="row-resize-handle" title="拖动调整高度"></div>
            <div class="row-controls">
                <button class="row-btn" onclick="moveRow('${pageId}', '${block.id}', ${rowIndex}, -1)" title="上移行">↑</button>
                <button class="row-btn" onclick="moveRow('${pageId}', '${block.id}', ${rowIndex}, 1)" title="下移行">↓</button>
                <button class="row-btn" onclick="addCellToRow('${pageId}', '${block.id}', ${rowIndex})" title="添加单元格">+</button>
                <button class="row-btn delete" onclick="deleteRowFromBlock('${pageId}', '${block.id}', ${rowIndex})" title="删除行">×</button>
            </div>
            <div class="row-content" style="min-height: ${height - 24}px;">
                ${(row.cells || []).map((cell, cellIndex) => renderCell(block, row, cell, pageId, rowIndex, cellIndex)).join('')}
                <div class="add-cell-btn" onclick="addCellToRow('${pageId}', '${block.id}', ${rowIndex})">
                    <span>+</span>
                    <small>添加内容</small>
                </div>
            </div>
        </div>
    `;
}

function renderCell(block, row, cell, pageId, rowIndex, cellIndex) {
    if (cell.type === 'text') {
        return `
            <div class="cell" data-cell-index="${cellIndex}" style="flex: ${getCellFlex(cell)}; min-width: 100px;">
                <div class="cell-actions">
                    <button class="cell-btn" onclick="event.stopPropagation(); toggleCellType('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})" title="转为图片">图</button>
                    <button class="cell-btn delete" onclick="event.stopPropagation(); deleteCellFromRow('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})" title="删除">×</button>
                </div>
                <textarea class="cell-text" placeholder="输入文本内容..." 
                    onblur="updateCellContent('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex}, this.value)">${cell.content || ''}</textarea>
            </div>
        `;
    } else if (cell.type === 'model') {
        const hasSrc = cell.src && cell.src.trim();
        return `
            <div class="cell" data-cell-index="${cellIndex}" style="flex: ${getCellFlex(cell)}; min-width: 100px;">
                <div class="cell-actions">
                    <button class="cell-btn" onclick="event.stopPropagation(); toggleCellType('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})" title="转为文本">文</button>
                    <button class="cell-btn delete" onclick="event.stopPropagation(); deleteCellFromRow('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})" title="删除">×</button>
                </div>
                <div class="cell-model" onclick="openModelPicker('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})">
                    <div class="cell-type-badge">3D模型</div>
                    ${hasSrc
                        ? `<iframe src="../${cell.src}" frameborder="0" style="width:100%;height:100%;"></iframe>`
                        : `<span>点击选择3D模型文件</span>`}
                </div>
                <div class="cell-caption">
                    <input type="text" placeholder="模型说明" value="${cell.caption || ''}" 
                        onchange="updateCellCaption('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex}, this.value)">
                </div>
            </div>
        `;
    } else {
        const isWallpaper = cell.wallpaper;
        return `
            <div class="cell" data-cell-index="${cellIndex}" style="flex: ${getCellFlex(cell)}; min-width: 100px;">
                <div class="cell-actions">
                    <button class="cell-btn ${isWallpaper ? 'active' : ''}" onclick="event.stopPropagation(); toggleWallpaper('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})" title="卷轴模式">卷</button>
                    <button class="cell-btn" onclick="event.stopPropagation(); toggleCellType('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})" title="转为模型">模</button>
                    <button class="cell-btn delete" onclick="event.stopPropagation(); deleteCellFromRow('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})" title="删除">×</button>
                </div>
                <div class="cell-image ${isWallpaper ? 'wallpaper' : ''}" onclick="openImagePicker('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex})">
                    <div class="cell-type-badge">${isWallpaper ? '卷轴' : '图片'}</div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                    </svg>
                    <span>点击选择图片</span>
                    <img src="${cell.src}" alt="" onerror="this.style.display='none'">
                </div>
                <div class="cell-caption">
                    <input type="text" placeholder="图片说明" value="${cell.caption || ''}" 
                        onchange="updateCellCaption('${pageId}', '${block.id}', ${rowIndex}, ${cellIndex}, this.value)">
                </div>
            </div>
        `;
    }
}

function setupImagePicker() {
    const picker = document.getElementById('imagePicker');
    
    picker.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && currentImageTarget) {
            const { pageId, blockId, rowIndex, cellIndex } = currentImageTarget;
            const page = siteData.pages.find(p => p.id === pageId);
            const block = page.blocks.find(b => b.id === blockId);
            const cell = block.rows[rowIndex].cells[cellIndex];
            
            const relativePath = 'image/' + file.name;
            cell.src = relativePath;
            
            const img = new Image();
            img.onload = function() {
                cell.aspectRatio = img.naturalWidth / img.naturalHeight;
                cell.src = relativePath;
                saveData();
                const cellEl = document.querySelector(`[data-block-id="${blockId}"] .block-row:nth-child(${rowIndex + 1}) .cell:nth-child(${cellIndex + 1}) .cell-image`);
                if (cellEl) {
                    cellEl.classList.add('has-image');
                    cellEl.querySelector('img').src = relativePath;
                }
                renderPageContent(pageId);
                syncToDisplay();
            };
            img.onerror = function() {
                cell.aspectRatio = 1.33;
                saveData();
                syncToDisplay();
            };
            img.src = relativePath;
        }
        currentImageTarget = null;
        picker.value = '';
    });
}

function openImagePicker(pageId, blockId, rowIndex, cellIndex) {
    currentImageTarget = { pageId, blockId, rowIndex, cellIndex };
    const picker = document.getElementById('imagePicker');
    picker.removeAttribute('webkitdirectory');
    picker.click();
}

function setupRowResize() {
    document.addEventListener('mousemove', function(e) {
        if (isResizingRow && resizingRow) {
            const pageId = resizingRow.getAttribute('data-page-id');
            const blockId = resizingRow.getAttribute('data-block-id');
            const rowIndex = parseInt(resizingRow.getAttribute('data-row-index'));
            
            const newHeight = startHeight + (e.clientY - startY);
            const minHeight = 100;
            const maxHeight = 800;
            const finalHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
            
            const rowContent = resizingRow.querySelector('.row-content');
            resizingRow.style.minHeight = finalHeight + 'px';
            rowContent.style.minHeight = (finalHeight - 24) + 'px';
        }
    });
    
    document.addEventListener('mouseup', function() {
        if (isResizingRow && resizingRow) {
            const pageId = resizingRow.getAttribute('data-page-id');
            const blockId = resizingRow.getAttribute('data-block-id');
            const rowIndex = parseInt(resizingRow.getAttribute('data-row-index'));
            const newHeight = parseInt(resizingRow.style.minHeight);
            
            const page = siteData.pages.find(p => p.id === pageId);
            const block = page.blocks.find(b => b.id === blockId);
            block.rows[rowIndex].height = newHeight;
            saveData();
            syncToDisplay();
            
            isResizingRow = false;
            resizingRow = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            applyCellShadows();
        }
    });
}

function initRowResizers() {
    const handles = document.querySelectorAll('.row-resize-handle');
    
    handles.forEach(handle => {
        const row = handle.closest('.block-row');
        const block = row.closest('.block');
        const pageId = document.querySelector('.content-page.active')?.id.replace('page-content-', '');
        
        handle.setAttribute('data-page-id', pageId);
        handle.setAttribute('data-block-id', block?.getAttribute('data-block-id') || '');
        handle.setAttribute('data-row-index', row.getAttribute('data-row-index'));
        
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            isResizingRow = true;
            resizingRow = row;
            startY = e.clientY;
            startHeight = parseInt(row.style.minHeight) || 200;
            
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        });
    });
}

function initDragAndDrop() {
    const blocks = document.querySelectorAll('.block[draggable="true"]');
    
    blocks.forEach(block => {
        block.addEventListener('dragstart', function(e) {
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            this.setAttribute('data-drag-id', this.getAttribute('data-block-id'));
        });
        
        block.addEventListener('dragend', function(e) {
            this.classList.remove('dragging');
        });
        
        block.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        block.addEventListener('drop', function(e) {
            e.preventDefault();
            const fromId = e.target.closest('.block').getAttribute('data-drag-id');
            const toId = this.getAttribute('data-block-id');
            if (fromId && toId && fromId !== toId) {
                swapBlocks(fromId, toId);
            }
        });
    });
}

function swapBlocks(fromId, toId) {
    if (!currentPage) return;
    const page = siteData.pages.find(p => p.id === currentPage);
    if (!page || !page.blocks) return;
    
    const fromIndex = page.blocks.findIndex(b => b.id === fromId);
    const toIndex = page.blocks.findIndex(b => b.id === toId);
    
    if (fromIndex !== -1 && toIndex !== -1) {
        const temp = page.blocks[fromIndex];
        page.blocks[fromIndex] = page.blocks[toIndex];
        page.blocks[toIndex] = temp;
        saveData();
        renderTree();
        renderPageContent(currentPage);
        syncToDisplay();
    }
}

function addPage() {
    const name = prompt('请输入页面名称：');
    if (name) {
        const id = 'page_' + Date.now();
        siteData.pages.push({ id, name, blocks: [] });
        saveData();
        renderTree();
        syncToDisplay();
    }
}

function addBlock(type) {
    if (!currentPage) {
        alert('请先选择一个页面');
        return;
    }
    addBlockToPage(currentPage);
}

function addBlockToPage(pageId) {
    const label = prompt('请输入区块标题：') || '新区块';
    const id = 'block_' + Date.now();
    
    const page = siteData.pages.find(p => p.id === pageId);
    if (!page.blocks) page.blocks = [];
    
    const newBlock = {
        id,
        label,
        rows: [{ cells: [], height: 200 }]
    };
    
    page.blocks.push(newBlock);
    saveData();
    renderTree();
    renderPageContent(pageId);
    syncToDisplay();
}

function deletePage(pageId) {
    if (confirm('确定删除该页面？')) {
        siteData.pages = siteData.pages.filter(p => p.id !== pageId);
        saveData();
        renderTree();
        document.getElementById('contentArea').innerHTML = '<div class="empty-state"><p>从左侧选择一个页面开始编辑</p></div>';
        currentPage = null;
        syncToDisplay();
    }
}

function deleteBlock(pageId, blockId) {
    const page = siteData.pages.find(p => p.id === pageId);
    page.blocks = page.blocks.filter(b => b.id !== blockId);
    saveData();
    renderTree();
    renderPageContent(pageId);
    syncToDisplay();
}

function moveBlock(pageId, blockId, direction) {
    const page = siteData.pages.find(p => p.id === pageId);
    const index = page.blocks.findIndex(b => b.id === blockId);
    const newIndex = index + direction;
    
    if (newIndex >= 0 && newIndex < page.blocks.length) {
        const temp = page.blocks[index];
        page.blocks[index] = page.blocks[newIndex];
        page.blocks[newIndex] = temp;
        saveData();
        renderTree();
        renderPageContent(pageId);
        syncToDisplay();
    }
}

function editBlockTitle(pageId, blockId, element) {
    const newTitle = prompt('请输入区块标题：', element.textContent);
    if (newTitle) {
        const page = siteData.pages.find(p => p.id === pageId);
        const block = page.blocks.find(b => b.id === blockId);
        block.label = newTitle;
        saveData();
        element.textContent = newTitle;
        renderTree();
        syncToDisplay();
    }
}

function addRowToBlock(pageId, blockId) {
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    if (!block.rows) block.rows = [];
    block.rows.push({ cells: [], height: 200 });
    saveData();
    renderPageContent(pageId);
    syncToDisplay();
}

function deleteRowFromBlock(pageId, blockId, rowIndex) {
    event.stopPropagation();
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    if (block.rows.length > 1) {
        block.rows.splice(rowIndex, 1);
        saveData();
        renderPageContent(pageId);
        syncToDisplay();
    } else {
        alert('至少需要保留一行');
    }
}

function moveRow(pageId, blockId, rowIndex, direction) {
    event.stopPropagation();
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    const newIndex = rowIndex + direction;
    
    if (newIndex >= 0 && newIndex < block.rows.length) {
        const temp = block.rows[rowIndex];
        block.rows[rowIndex] = block.rows[newIndex];
        block.rows[newIndex] = temp;
        saveData();
        renderPageContent(pageId);
        syncToDisplay();
    }
}

function addCellToRow(pageId, blockId, rowIndex) {
    const cellType = prompt('选择内容类型（text/image）：', 'image');
    if (cellType !== 'text' && cellType !== 'image') return;
    
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    if (!block.rows[rowIndex].cells) block.rows[rowIndex].cells = [];
    
    const newCell = cellType === 'text' 
        ? { type: 'text', content: '' }
        : { type: 'image', src: '', caption: '', wallpaper: false };
    
    block.rows[rowIndex].cells.push(newCell);
    saveData();
    renderPageContent(pageId);
    syncToDisplay();
}

function deleteCellFromRow(pageId, blockId, rowIndex, cellIndex) {
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    block.rows[rowIndex].cells.splice(cellIndex, 1);
    saveData();
    renderPageContent(pageId);
    syncToDisplay();
}

function updateCellContent(pageId, blockId, rowIndex, cellIndex, content) {
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    block.rows[rowIndex].cells[cellIndex].content = content;
    saveData();
    syncToDisplay();
}

function updateCellCaption(pageId, blockId, rowIndex, cellIndex, caption) {
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    block.rows[rowIndex].cells[cellIndex].caption = caption;
    saveData();
    syncToDisplay();
}

function toggleCellType(pageId, blockId, rowIndex, cellIndex) {
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    const cell = block.rows[rowIndex].cells[cellIndex];
    
    if (cell.type === 'text') {
        const newCell = { type: 'image', src: '', caption: '', wallpaper: false };
        block.rows[rowIndex].cells[cellIndex] = newCell;
    } else if (cell.type === 'image') {
        const newCell = { type: 'model', src: '', caption: '' };
        block.rows[rowIndex].cells[cellIndex] = newCell;
    } else {
        const newCell = { type: 'text', content: cell.caption || '' };
        block.rows[rowIndex].cells[cellIndex] = newCell;
    }
    
    saveData();
    renderPageContent(pageId);
    syncToDisplay();
}

function openModelPicker(pageId, blockId, rowIndex, cellIndex) {
    // List available .html files in model/ folder
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    const cell = block.rows[rowIndex].cells[cellIndex];
    
    // Use a prompt as a simple file selector
    const availableModels = ['pareto_front_3d_interactive.html'];
    const msg = '选择3D模型文件 (输入编号):\n' + availableModels.map((f,i) => `${i+1}. ${f}`).join('\n');
    const choice = prompt(msg, '1');
    if (choice) {
        const idx = parseInt(choice) - 1;
        if (idx >= 0 && idx < availableModels.length) {
            cell.src = 'model/' + availableModels[idx];
            saveData();
            renderPageContent(pageId);
            syncToDisplay();
        }
    }
}

function toggleWallpaper(pageId, blockId, rowIndex, cellIndex) {
    const page = siteData.pages.find(p => p.id === pageId);
    const block = page.blocks.find(b => b.id === blockId);
    const cell = block.rows[rowIndex].cells[cellIndex];
    
    if (cell.type === 'image') {
        cell.wallpaper = !cell.wallpaper;
        saveData();
        renderPageContent(pageId);
        syncToDisplay();
    }
}

function openSettings() {
    document.getElementById('settingsModal').classList.add('open');
    const s = siteData.settings;
    document.getElementById('bgR').value = s.bgColor.r;
    document.getElementById('bgG').value = s.bgColor.g;
    document.getElementById('bgB').value = s.bgColor.b;
    document.getElementById('bgColorPreview').style.backgroundColor = `rgb(${s.bgColor.r},${s.bgColor.g},${s.bgColor.b})`;
    document.getElementById('titleFontFamily').value = s.titleFont.family;
    document.getElementById('titleFontSize').value = s.titleFont.size;
    document.getElementById('titleFontColor').value = s.titleFont.color;
    document.getElementById('contentFontFamily').value = s.contentFont.family;
    document.getElementById('contentFontSize').value = s.contentFont.size;
    document.getElementById('contentFontColor').value = s.contentFont.color;
    document.getElementById('noteFontFamily').value = s.noteFont.family;
    document.getElementById('noteFontSize').value = s.noteFont.size;
    document.getElementById('noteFontColor').value = s.noteFont.color;
    if (s.captionFont) {
        document.getElementById('captionFontFamily').value = s.captionFont.family || 'Microsoft YaHei';
        document.getElementById('captionFontSize').value = s.captionFont.size || 12;
        document.getElementById('captionFontColor').value = s.captionFont.color || '#cccccc';
    }
    document.getElementById('shadowDivisor').value = s.shadowDivisor || 20;
    document.getElementById('shadowOpacity').value = s.shadowOpacity || 0.35;
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('open');
}

function updateBgColor() {
    const r = document.getElementById('bgR').value;
    const g = document.getElementById('bgG').value;
    const b = document.getElementById('bgB').value;
    siteData.settings.bgColor = { r: parseInt(r), g: parseInt(g), b: parseInt(b) };
    document.getElementById('bgColorPreview').style.backgroundColor = `rgb(${r},${g},${b})`;
    applySettings();
    saveData();
    syncToDisplay();
}

function updateFont() {
    siteData.settings.titleFont = {
        family: document.getElementById('titleFontFamily').value,
        size: parseInt(document.getElementById('titleFontSize').value),
        color: document.getElementById('titleFontColor').value
    };
    siteData.settings.contentFont = {
        family: document.getElementById('contentFontFamily').value,
        size: parseInt(document.getElementById('contentFontSize').value),
        color: document.getElementById('contentFontColor').value
    };
    siteData.settings.noteFont = {
        family: document.getElementById('noteFontFamily').value,
        size: parseInt(document.getElementById('noteFontSize').value),
        color: document.getElementById('noteFontColor').value
    };
    siteData.settings.captionFont = {
        family: document.getElementById('captionFontFamily').value,
        size: parseInt(document.getElementById('captionFontSize').value),
        color: document.getElementById('captionFontColor').value
    };
    applySettings();
    saveData();
    syncToDisplay();
}

function updateShadow() {
    siteData.settings.shadowDivisor = parseInt(document.getElementById('shadowDivisor').value) || 20;
    siteData.settings.shadowOpacity = parseFloat(document.getElementById('shadowOpacity').value) || 0.35;
    applySettings();
    saveData();
    syncToDisplay();
    applyCellShadows();
}

function applyCellShadows() {
    const cells = document.querySelectorAll('.cell-image, .cell-model');
    const divisor = siteData.settings.shadowDivisor || 20;
    const opacity = siteData.settings.shadowOpacity || 0.35;
    cells.forEach(el => {
        const w = el.offsetWidth;
        const blur = Math.max(4, Math.round(w / divisor));
        const offsetY = Math.max(2, Math.round(blur / 3));
        el.style.setProperty('--shadow-blur', blur + 'px');
        el.style.setProperty('--shadow-offset', offsetY + 'px');
        el.style.setProperty('--shadow-color', `rgba(0,0,0,${opacity})`);
    });
}

function applySettings() {
    const s = siteData.settings;
    document.documentElement.style.setProperty('--bg-color', `rgb(${s.bgColor.r},${s.bgColor.g},${s.bgColor.b})`);
    document.documentElement.style.setProperty('--title-size', s.titleFont.size + 'px');
    document.documentElement.style.setProperty('--title-color', s.titleFont.color);
    document.documentElement.style.setProperty('--title-font', s.titleFont.family);
    document.documentElement.style.setProperty('--content-size', s.contentFont.size + 'px');
    document.documentElement.style.setProperty('--content-color', s.contentFont.color);
    document.documentElement.style.setProperty('--content-font', s.contentFont.family);
    document.documentElement.style.setProperty('--note-size', s.noteFont.size + 'px');
    document.documentElement.style.setProperty('--note-color', s.noteFont.color);
    document.documentElement.style.setProperty('--note-font', s.noteFont.family);
    if (s.captionFont) {
        document.documentElement.style.setProperty('--caption-font', s.captionFont.family);
        document.documentElement.style.setProperty('--caption-size', s.captionFont.size + 'px');
        document.documentElement.style.setProperty('--caption-color', s.captionFont.color);
    }
}

function syncToDisplay() {
    saveData();
}

function exportData() {
    const dataStr = JSON.stringify(siteData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'site-data.json';
    a.click();
    URL.revokeObjectURL(url);
}

function exportPPT() {
    // 先导出 JSON 数据
    const dataStr = JSON.stringify(siteData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'site-data.json';
    a.click();
    URL.revokeObjectURL(url);
    
    // 提示运行脚本
    alert('✅ 数据已导出为 site-data.json\n\n请按以下步骤生成 PPT：\n\n1. 打开命令行 (CMD)\n2. 粘贴并运行以下命令：\n   cd /d C:\\Users\\Administrator\\Desktop\\NetDesigning\n   node export-ppt.js\n\n3. 生成的 "建筑设计展示.pptx" 将保存在 NetDesigning 文件夹');
}