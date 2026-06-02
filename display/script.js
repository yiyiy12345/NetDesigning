let aspectRatioMap = {};

document.addEventListener('DOMContentLoaded', function() {
    loadData();
    
    window.addEventListener('storage', function(e) {
        if (e.key === 'siteData') {
            loadData();
        }
    });
});

function preloadMissingAspectRatios(data) {
    const promises = [];
    const missing = [];
    
    (data.pages || []).forEach(page => {
        (page.blocks || []).forEach(block => {
            (block.rows || []).forEach(row => {
                (row.cells || []).forEach(cell => {
                    if (cell.type !== 'text' && cell.src && !cell.aspectRatio && !aspectRatioMap[cell.src]) {
                        missing.push(cell);
                    }
                });
            });
        });
    });
    
    if (missing.length === 0) return Promise.resolve();
    
    missing.forEach(cell => {
        const p = new Promise(resolve => {
            const img = new Image();
            img.onload = function() {
                aspectRatioMap[cell.src] = img.naturalWidth / img.naturalHeight;
                resolve();
            };
            img.onerror = function() {
                aspectRatioMap[cell.src] = 1.33;
                resolve();
            };
            const src = cell.src.startsWith('image/') ? '../' + cell.src : cell.src;
            img.src = src;
        });
        promises.push(p);
    });
    
    return Promise.all(promises);
}

function loadData() {
    const saved = localStorage.getItem('siteData');
    if (saved) {
        const siteData = JSON.parse(saved);
        applySettings(siteData);
        renderNav(siteData);
        preloadMissingAspectRatios(siteData).then(() => {
            renderPages(siteData);
            setTimeout(initWallpaperImages, 100);
        });
        return;
    }
    
    // Fallback: load from site-data.json (for GitHub Pages standalone mode)
    fetch('../site-data.json')
        .then(r => {
            if (!r.ok) throw new Error('No data file');
            return r.json();
        })
        .then(siteData => {
            applySettings(siteData);
            renderNav(siteData);
            preloadMissingAspectRatios(siteData).then(() => {
                renderPages(siteData);
                setTimeout(initWallpaperImages, 100);
            });
        })
        .catch(() => {
            document.getElementById('pageContainer').innerHTML = '<div style="padding:40px;color:rgba(255,255,255,0.5);">数据加载中，请确保 site-data.json 存在于项目根目录</div>';
        });
}

function applySettings(data) {
    const s = data.settings;
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

function renderNav(data) {
    const nav = document.getElementById('navList');
    
    if (!data.pages || data.pages.length === 0) {
        nav.innerHTML = '<li class="nav-item"><span style="padding:16px 24px;color:rgba(255,255,255,0.4);">暂无页面</span></li>';
        return;
    }
    
    nav.innerHTML = data.pages.map((page, index) => `
        <li class="nav-item">
            <a href="#${page.id}" class="nav-link ${index === 0 ? 'active' : ''}" data-page="${page.id}">
                <span class="nav-number">0${index + 1}</span>
                ${page.name}
            </a>
        </li>
    `).join('');
    
    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            nav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            const pageId = this.getAttribute('data-page');
            document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');
            
            setTimeout(initWallpaperImages, 100);
        });
    });
}

function renderPages(data) {
    const container = document.getElementById('pageContainer');
    
    if (!data.pages || data.pages.length === 0) {
        container.innerHTML = '<div style="padding:40px;color:rgba(255,255,255,0.5);">暂无页面内容</div>';
        return;
    }
    
    container.innerHTML = data.pages.map((page, index) => {
        const blocks = (page.blocks || []).map(block => renderBlock(block)).join('');
        
        return `
            <section id="${page.id}" class="page-section ${index === 0 ? 'active' : ''}">
                <div class="page-header">
                    <span class="page-number">0${index + 1}</span>
                    <h2 class="page-title">${page.name}</h2>
                    <div class="page-divider"></div>
                </div>
                <div class="page-content">
                    ${blocks || '<div style="color:rgba(255,255,255,0.4);padding:40px 0;">暂无内容</div>'}
                </div>
            </section>
        `;
    }).join('');
}

function renderBlock(block) {
    const rows = block.rows || [];
    if (rows.length === 0) return '';
    
    return `
        <div class="block">
            ${block.label ? `<h3 class="block-title">${block.label}</h3>` : ''}
            <div class="block-rows">
                ${rows.map(row => renderRow(row)).join('')}
            </div>
        </div>
    `;
}

function getCellFlex(cell) {
    if (cell.type === 'text') return 1;
    if (cell.type === 'model') return 1.5;
    if (cell.aspectRatio) return cell.aspectRatio;
    if (cell.src && aspectRatioMap[cell.src]) return aspectRatioMap[cell.src];
    return 1.33;
}

function renderRow(row) {
    const cells = row.cells || [];
    if (cells.length === 0) return '';
    
    const rowHeight = row.height || 200;
    
    return `
        <div class="block-row" style="min-height: ${rowHeight}px;">
            ${cells.map(cell => renderCell(cell, getCellFlex(cell))).join('')}
        </div>
    `;
}

function renderCell(cell, flexVal) {
    const flexStyle = `flex: ${flexVal}; min-width: 80px;`;
    
    if (cell.type === 'text') {
        if (!cell.content || !cell.content.trim()) return '';
        return `<div class="cell" style="${flexStyle}"><div class="cell-text">${cell.content}</div></div>`;
    } else if (cell.type === 'model') {
        if (!cell.src) return '';
        return `
            <div class="cell" style="${flexStyle}">
                <div class="cell-model">
                    <iframe src="../${cell.src}" frameborder="0" loading="lazy"></iframe>
                </div>
                ${cell.caption ? `<div class="cell-caption">${cell.caption}</div>` : ''}
            </div>
        `;
    } else {
        if (!cell.src) return '';
        
        const imageSrc = cell.src.startsWith('image/') ? cell.src : cell.src;
        const isWallpaper = cell.wallpaper;
        
        if (isWallpaper) {
            return `
                <div class="cell" style="${flexStyle}">
                    <div class="cell-image wallpaper" data-image-id="${Date.now()}_${Math.random()}">
                        <div class="scroll-container">
                            <img class="scroll-image" src="../${imageSrc}" alt="${cell.caption || ''}" onerror="this.style.display='none'">
                        </div>
                        <div class="scroll-hint">卷轴模式</div>
                        <div class="scroll-controls">
                            <button class="scroll-btn" onclick="zoomWallpaper(this, 1.2)">+</button>
                            <button class="scroll-btn" onclick="zoomWallpaper(this, 0.8)">−</button>
                            <button class="scroll-btn" onclick="resetWallpaper(this)">⟲</button>
                        </div>
                    </div>
                    ${cell.caption ? `<div class="cell-caption">${cell.caption}</div>` : ''}
                </div>
            `;
        } else {
            return `
                <div class="cell" style="${flexStyle}">
                    <div class="cell-image">
                        <img src="../${imageSrc}" alt="${cell.caption || ''}" onerror="this.parentElement.style.display='none'">
                    </div>
                    ${cell.caption ? `<div class="cell-caption">${cell.caption}</div>` : ''}
                </div>
            `;
        }
    }
}

function initWallpaperImages() {
    const wallpapers = document.querySelectorAll('.cell-image.wallpaper');
    
    wallpapers.forEach(wallpaper => {
        const scrollImg = wallpaper.querySelector('.scroll-image');
        const container = wallpaper.querySelector('.scroll-container');
        
        if (!scrollImg || !container) return;
        
        scrollImg.style.left = '0';
        scrollImg.style.top = '0';
        scrollImg.style.transform = 'scale(1)';
        
        let isDragging = false;
        let startX, startY;
        let currentLeft = 0;
        let currentTop = 0;
        let currentScale = 1;
        
        const imgSrc = scrollImg.src;
        const img = new Image();
        img.src = imgSrc;
        
        img.onload = function() {
            const containerRect = container.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height;
            
            if (containerWidth === 0 || containerHeight === 0) return;
            
            const imgRatio = img.width / img.height;
            const containerRatio = containerWidth / containerHeight;
            
            let displayWidth, displayHeight;
            
            if (imgRatio > containerRatio) {
                displayWidth = containerWidth;
                displayHeight = containerWidth / imgRatio;
            } else {
                displayHeight = containerHeight;
                displayWidth = containerHeight * imgRatio;
            }
            
            scrollImg.style.width = displayWidth + 'px';
            scrollImg.style.height = displayHeight + 'px';
            scrollImg.style.left = (containerWidth - displayWidth) / 2 + 'px';
            scrollImg.style.top = (containerHeight - displayHeight) / 2 + 'px';
            
            currentLeft = (containerWidth - displayWidth) / 2;
            currentTop = (containerHeight - displayHeight) / 2;
        };
        
        img.onerror = function() {
            scrollImg.style.display = 'none';
        };
        
        const updatePosition = (newLeft, newTop) => {
            const containerRect = container.getBoundingClientRect();
            const scaledWidth = parseFloat(scrollImg.style.width) * currentScale;
            const scaledHeight = parseFloat(scrollImg.style.height) * currentScale;
            
            const minLeft = containerRect.width - scaledWidth;
            const minTop = containerRect.height - scaledHeight;
            
            currentLeft = Math.min(0, Math.max(minLeft, newLeft));
            currentTop = Math.min(0, Math.max(minTop, newTop));
            
            scrollImg.style.left = currentLeft + 'px';
            scrollImg.style.top = currentTop + 'px';
        };
        
        wallpaper.addEventListener('mousedown', function(e) {
            if (e.target.classList.contains('scroll-btn')) return;
            isDragging = true;
            startX = e.clientX - currentLeft;
            startY = e.clientY - currentTop;
            wallpaper.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            updatePosition(e.clientX - startX, e.clientY - startY);
        });
        
        document.addEventListener('mouseup', function() {
            isDragging = false;
            wallpaper.style.cursor = 'grab';
        });
        
        wallpaper.addEventListener('wheel', function(e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.min(3, Math.max(0.5, currentScale * delta));
            
            currentLeft = currentLeft * (newScale / currentScale);
            currentTop = currentTop * (newScale / currentScale);
            currentScale = newScale;
            
            scrollImg.style.width = parseFloat(scrollImg.style.width) * newScale + 'px';
            scrollImg.style.height = parseFloat(scrollImg.style.height) * newScale + 'px';
            updatePosition(currentLeft, currentTop);
        });
    });
}

function zoomWallpaper(btn, factor) {
    event.stopPropagation();
    const wallpaper = btn.closest('.cell-image');
    const scrollImg = wallpaper.querySelector('.scroll-image');
    const container = wallpaper.querySelector('.scroll-container');
    
    const currentScale = parseFloat(scrollImg.style.transform.replace('scale(', '').replace(')', '')) || 1;
    const newScale = Math.min(3, Math.max(0.5, currentScale * factor));
    
    scrollImg.style.width = (parseFloat(scrollImg.style.width) / currentScale * newScale) + 'px';
    scrollImg.style.height = (parseFloat(scrollImg.style.height) / currentScale * newScale) + 'px';
    scrollImg.style.transform = `scale(${newScale})`;
    
    const containerRect = container.getBoundingClientRect();
    const scaledWidth = parseFloat(scrollImg.style.width);
    const scaledHeight = parseFloat(scrollImg.style.height);
    
    const minLeft = containerRect.width - scaledWidth;
    const minTop = containerRect.height - scaledHeight;
    
    let left = parseFloat(scrollImg.style.left);
    let top = parseFloat(scrollImg.style.top);
    
    scrollImg.style.left = Math.min(0, Math.max(minLeft, left)) + 'px';
    scrollImg.style.top = Math.min(0, Math.max(minTop, top)) + 'px';
}

function resetWallpaper(btn) {
    event.stopPropagation();
    const wallpaper = btn.closest('.cell-image');
    const scrollImg = wallpaper.querySelector('.scroll-image');
    const container = wallpaper.querySelector('.scroll-container');
    
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    const imgSrc = scrollImg.src;
    const img = new Image();
    img.src = imgSrc;
    
    img.onload = function() {
        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        
        if (containerWidth === 0 || containerHeight === 0) return;
        
        const imgRatio = img.width / img.height;
        const containerRatio = containerWidth / containerHeight;
        
        let displayWidth, displayHeight;
        
        if (imgRatio > containerRatio) {
            displayWidth = containerWidth;
            displayHeight = containerWidth / imgRatio;
        } else {
            displayHeight = containerHeight;
            displayWidth = containerHeight * imgRatio;
        }
        
        scrollImg.style.width = displayWidth + 'px';
        scrollImg.style.height = displayHeight + 'px';
        scrollImg.style.left = (containerWidth - displayWidth) / 2 + 'px';
        scrollImg.style.top = (containerHeight - displayHeight) / 2 + 'px';
        scrollImg.style.transform = 'scale(1)';
        scrollImg.style.display = 'block';
    };
    
    img.onerror = function() {
        scrollImg.style.display = 'none';
    };
}