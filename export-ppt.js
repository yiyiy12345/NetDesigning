/**
 * NetDesigning → PPTX 导出脚本 (v2)
 * 
 * 版式: 横版 A4 · 2cm 边距 · 纵向排列 · 相等间距
 * 
 * 用法:
 *   node export-ppt.js [数据文件] [输出文件]
 *
 * 版式设计:
 *   - 横版 A4 (11.69" × 8.27")
 *   - 四边 2cm 间距，内容居中
 *   - 每行(row) = 一页幻灯片
 *   - 单元格(cell) 纵向排列，间距相等
 *   - 文本左对齐，首段缩进 2 字符
 *   - 图片等比缩放，无拉伸
 */

const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');

// ============ 布局常量 ============
// 横版 A4 (英寸)
const PAGE_W = 11.69;
const PAGE_H = 8.27;

// 2cm ≈ 0.7874 英寸
const M_IN = 0.7874;

// 内容区域
const CX = M_IN;                       // 内容左边界
const CY = M_IN;                       // 内容上边界
const CW = PAGE_W - 2 * M_IN;          // 内容宽度 ≈ 10.11"
const CH = PAGE_H - 2 * M_IN;          // 内容高度 ≈ 6.69"

// 区块标签
const LABEL_H = 0.3;
const LABEL_GAP = 0.06;

// 图片说明
const CAPTION_H = 0.25;

// 文本行高系数
const LINE_SPACING = 1.35;

// 首段缩进字符数
const INDENT_CHARS = 2;

// ============ 文本高度估算 ============
function estimateTextH(text, fontSizePt, maxWidthIn) {
    if (!text || !text.trim()) return 0;
    // 中文字符宽度 ≈ fontSize (pt)
    const availW = maxWidthIn * 72;           // 可用宽度 (pt)
    const cpl = Math.max(1, Math.floor(availW / fontSizePt));
    const lines = Math.ceil(text.length / cpl);
    const lineH = (fontSizePt * LINE_SPACING) / 72;
    return lines * lineH + 0.05; // 底部留一点空隙
}

// ============ 图片尺寸计算 (不拉伸) ============
function getImageBox(imgPath, maxW) {
    const dim = sizeOf(imgPath);
    const aspect = dim.width / dim.height;
    if (aspect >= 1) {
        // 宽图/方图: 宽度撑满
        return { w: maxW, h: maxW / aspect, aspect };
    } else {
        // 高图: 高度受限，防止过高
        const maxH = CH * 0.65;
        const h = Math.min(maxW / aspect, maxH);
        return { w: h * aspect, h, aspect };
    }
}

// ============ 颜色转换 ============
function rgbToHex(r, g, b) {
    return [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();
}

// ============ 图片读取为 Base64 ============
function readImageBase64(imgPath) {
    const ext = path.extname(imgPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png'
               : ext === '.gif' ? 'image/gif'
               : 'image/jpeg';
    const data = fs.readFileSync(imgPath);
    return `data:${mime};base64,${data.toString('base64')}`;
}

// ============ 主函数 ============
async function main() {
    const args = process.argv.slice(2);
    const dataFile = args[0] || 'site-data.json';
    const outputFile = args[1] || '建筑设计展示.pptx';

    if (!fs.existsSync(dataFile)) {
        console.error(`❌ 找不到数据文件: ${dataFile}`);
        console.error(`   请先在编辑器中点击"导出PPT"按钮生成 ${dataFile}`);
        process.exit(1);
    }

    console.log(`📖 读取数据文件: ${dataFile}`);
    const siteData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const s = siteData.settings;
    const bgHex = rgbToHex(s.bgColor.r, s.bgColor.g, s.bgColor.b);
    const imageDir = path.join(process.cwd(), 'image');

    console.log(`📐 页面数: ${siteData.pages.length}`);
    console.log(`🎨 主题色: #${bgHex}`);
    console.log(`📏 横版 A4 · 2cm 边距 · 内容区 ${CW.toFixed(2)}" × ${CH.toFixed(2)}"\n`);

    // 初始化 PPTX
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: PAGE_W, height: PAGE_H });
    pptx.layout = 'A4_LANDSCAPE';
    pptx.author = 'NetDesigning';
    pptx.title = siteData.pages.map(p => p.name).join(' | ') || '建筑设计展示';

    let stats = { pages: 0, blocks: 0, slides: 0, images: 0, texts: 0, caps: 0, errors: 0 };

    // ============ 遍历页面 → 区块 → 行 ============
    for (const page of siteData.pages) {
        stats.pages++;
        for (const block of page.blocks || []) {
            stats.blocks++;
            for (const row of block.rows || []) {
                const cells = row.cells || [];
                const slide = pptx.addSlide();
                slide.background = { fill: '#' + bgHex };
                stats.slides++;

                // ───── 顶部: 页面 + 区块信息 (副标题样式) ─────
                const labelText = block.label
                    ? `${page.name}  /  ${block.label}`
                    : page.name;
                slide.addText(labelText, {
                    x: CX, y: CY, w: CW, h: LABEL_H,
                    fontSize: 11,
                    color: s.noteFont.color,
                    fontFace: s.noteFont.family,
                    align: 'left', valign: 'middle',
                    italic: true
                });

                if (cells.length === 0) {
                    slide.addText('（此行暂无内容）', {
                        x: CX, y: CY + LABEL_H + 0.1, w: CW, h: 0.4,
                        fontSize: s.noteFont.size,
                        color: s.noteFont.color,
                        fontFace: s.noteFont.family,
                        align: 'center', italic: true
                    });
                    continue;
                }

                // ───── 第一阶段: 计算每个单元格的自然高度 ─────
                const cellInfo = [];
                for (const cell of cells) {
                    if (cell.type === 'text') {
                        const h = estimateTextH(
                            cell.content, s.contentFont.size, CW
                        );
                        cellInfo.push({
                            type: 'text',
                            height: Math.max(h, 0.2),
                            content: cell.content
                        });
                        stats.texts++;
                    } else if (cell.type === 'image' && cell.src) {
                        const imgFile = path.basename(
                            cell.src.replace(/\\/g, '/')
                        );
                        const imgPath = path.join(imageDir, imgFile);
                        if (!fs.existsSync(imgPath)) {
                            cellInfo.push({
                                type: 'error', height: 0.3,
                                msg: `[缺失: ${imgFile}]`
                            });
                            stats.errors++;
                        } else {
                            const box = getImageBox(imgPath, CW);
                            const hasCap = cell.caption && cell.caption.trim();
                            const capH = hasCap ? CAPTION_H : 0;
                            cellInfo.push({
                                type: 'image',
                                height: box.h + capH,
                                imgPath, box,
                                caption: hasCap ? cell.caption.trim() : '',
                                wallpaper: !!cell.wallpaper
                            });
                            stats.images++;
                            if (hasCap) stats.caps++;
                        }
                    }
                }

                if (cellInfo.length === 0) continue;

                // ───── 第二阶段: 等比例缩放 + 相等间距 ─────
                const cellAreaY = CY + LABEL_H + LABEL_GAP;
                const cellAreaH = CY + CH - cellAreaY;

                const totalNaturalH = cellInfo.reduce(
                    (sum, ci) => sum + ci.height, 0
                );
                let scale = 1;
                let gap = 0;

                if (totalNaturalH > cellAreaH) {
                    // 内容超出 → 等比例缩小
                    scale = cellAreaH / totalNaturalH;
                } else if (cellInfo.length > 1) {
                    // 空间有余 → 平均分配间距
                    gap = (cellAreaH - totalNaturalH) / (cellInfo.length - 1);
                }

                // ───── 第三阶段: 渲染 ─────
                let currentY = cellAreaY;

                for (let i = 0; i < cellInfo.length; i++) {
                    const ci = cellInfo[i];
                    const cellH = ci.height * scale;

                    if (ci.type === 'text') {
                        // 文本: 左对齐, 首段缩进 2 字符
                        const indentIn = (INDENT_CHARS * s.contentFont.size) / 72;
                        slide.addText(ci.content, {
                            x: CX + indentIn,  // 整体左移缩进量，实现首行缩进效果
                            y: currentY,
                            w: CW - indentIn,
                            h: cellH,
                            fontSize: s.contentFont.size,
                            color: s.contentFont.color,
                            fontFace: s.contentFont.family,
                            align: 'left',
                            valign: 'top',
                            wrap: true,
                            lineSpacingMultiple: LINE_SPACING
                        });

                    } else if (ci.type === 'image') {
                        // 图片: 居中, 无拉伸
                        const imgW = ci.box.w * scale;
                        const imgH = ci.box.h * scale;
                        const imgX = CX + (CW - imgW) / 2;
                        const base64 = readImageBase64(ci.imgPath);

                        if (ci.wallpaper) {
                            // 卷轴模式: 铺满保持比例
                            slide.addImage({
                                data: base64,
                                x: CX, y: currentY,
                                w: CW, h: cellH,
                                sizing: { type: 'cover', w: CW, h: cellH }
                            });
                        } else {
                            // 普通图片: contain 模式 (不拉伸)
                            slide.addImage({
                                data: base64,
                                x: imgX, y: currentY,
                                w: imgW, h: imgH,
                                sizing: { type: 'contain', w: imgW, h: imgH }
                            });
                        }

                        // 图片说明
                        if (ci.caption) {
                            const capY = currentY + imgH + 0.02;
                            slide.addText(ci.caption, {
                                x: CX, y: capY, w: CW, h: CAPTION_H * scale,
                                fontSize: s.noteFont.size,
                                color: s.noteFont.color,
                                fontFace: s.noteFont.family,
                                align: 'center', valign: 'top', wrap: true
                            });
                        }

                    } else if (ci.type === 'error') {
                        slide.addText(ci.msg, {
                            x: CX, y: currentY, w: CW, h: cellH,
                            fontSize: 10, color: 'FF6666',
                            fontFace: s.noteFont.family,
                            align: 'center'
                        });
                    }

                    currentY += cellH + gap;
                }
            }
        }
    }

    // ============ 输出 ============
    console.log(`\n📊 统计:`);
    console.log(
        `   页面: ${stats.pages}  ` +
        `|  区块: ${stats.blocks}  ` +
        `|  幻灯片: ${stats.slides}`
    );
    console.log(
        `   文本块: ${stats.texts}  ` +
        `|  图片: ${stats.images}  ` +
        `|  图片说明: ${stats.caps}`
    );
    if (stats.errors) console.log(`   ⚠️  错误: ${stats.errors}`);

    console.log(`\n💾 正在生成 PPTX ...`);
    await pptx.writeFile({ fileName: outputFile });
    console.log(`✅ PPT 生成成功: ${path.resolve(outputFile)}`);
    console.log(
        `   (横版 A4 · 2cm 边距 · ${CW.toFixed(1)}"×${CH.toFixed(1)}" ` +
        `内容区 · ${stats.slides} 张幻灯片)`
    );
}

main().catch(err => {
    console.error('❌ 生成失败:', err.message);
    process.exit(1);
});
