let currentImage = null;

function showMessage(message, isError = false) {
  // 确保存在消息容器
  let messageContainer = document.querySelector('.message-container');
  if (!messageContainer) {
    messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';
    document.body.appendChild(messageContainer);
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isError ? 'error' : 'success'}`;
  msgDiv.textContent = message;
  messageContainer.appendChild(msgDiv);
  
  // 自动移除消息
  setTimeout(() => {
    msgDiv.style.opacity = '0';
    msgDiv.style.transform = 'translateY(-20px)';
    msgDiv.style.transition = 'all 0.3s ease';
    
    setTimeout(() => msgDiv.remove(), 300);
  }, 3000);
}

// 添加图片信息显示功能
function showImageInfo(image) {
  const existingInfo = document.querySelector('.image-info');
  if (existingInfo) {
    existingInfo.remove();
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'image-info';
  infoDiv.innerHTML = `
    <div class="info-item">尺寸：${image.width} × ${image.height}px</div>
    <div class="info-item">类型：${image.type || '图片'}</div>
  `;
  document.querySelector('.image-container').appendChild(infoDiv);
}

// 添加预览画布的样式
function addPreviewStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .guide-line {
      position: absolute;
      background: rgba(255, 64, 129, 0.5);
      transition: background 0.3s;
    }
    
    .guide-line:hover {
      background: rgba(255, 64, 129, 0.8);
    }
    
    .guide-line.vertical {
      width: 4px;
      margin-left: -2px;
      cursor: col-resize;
    }
    
    .guide-line.horizontal {
      height: 4px;
      margin-top: -2px;
      cursor: row-resize;
    }
  `;
  document.head.appendChild(style);
}

// 添加清除预览的函数
function clearPreview() {
  const canvas = document.querySelector('.preview-canvas');
  if (canvas) {
    canvas.remove();
  }
}

// 添加自动识别的相关函数
function getImageData(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function isTransparentRow(imageData, y) {
  const width = imageData.width;
  for (let x = 0; x < width; x++) {
    const alpha = imageData.data[((y * width) + x) * 4 + 3];
    if (alpha > 10) return false; // 非透明
  }
  return true;
}

function isTransparentColumn(imageData, x) {
  const height = imageData.height;
  for (let y = 0; y < height; y++) {
    const alpha = imageData.data[((y * imageData.width) + x) * 4 + 3];
    if (alpha > 10) return false; // 非透明
  }
  return true;
}

function findSliceLines(imageData, isVertical = true) {
  const size = isVertical ? imageData.width : imageData.height;
  const lines = [];
  let inTransparent = false;

  for (let i = 0; i < size; i++) {
    const isTransparent = isVertical ? 
      isTransparentColumn(imageData, i) : 
      isTransparentRow(imageData, i);

    if (isTransparent && !inTransparent) {
      lines.push(i);
      inTransparent = true;
    } else if (!isTransparent && inTransparent) {
      inTransparent = false;
    }
  }
  return lines;
}

function autoDetectSlices(image) {
  const imageData = getImageData(image);
  const verticalLines = findSliceLines(imageData, true);
  const horizontalLines = findSliceLines(imageData, false);

  // 添加图片边界
  verticalLines.unshift(0);
  verticalLines.push(image.width);
  horizontalLines.unshift(0);
  horizontalLines.push(image.height);

  // 计算切片位置
  const slices = [];
  for (let i = 0; i < horizontalLines.length - 1; i++) {
    for (let j = 0; j < verticalLines.length - 1; j++) {
      const x = verticalLines[j];
      const y = horizontalLines[i];
      const width = verticalLines[j + 1] - x;
      const height = horizontalLines[i + 1] - y;
      
      // 忽略太小的切片
      if (width < 10 || height < 10) continue;
      
      slices.push({
        x, y, width, height
      });
    }
  }

  return {
    slices,
    rows: horizontalLines.length - 1,
    cols: verticalLines.length - 1,
    horizontalLines,
    verticalLines
  };
}

// 添加可调整的切割线类
class AdjustableGuideLines {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.lines = new Map();
    this.scale = options.scale;
    this.offset = options.offset;
    this.onLineMove = options.onLineMove || (() => {});
  }

  // 创建切割线
  createLine(position, isVertical) {
    const line = document.createElement('div');
    line.className = `guide-line ${isVertical ? 'vertical' : 'horizontal'}`;
    
    const displayPos = this.getDisplayPosition(position, isVertical);
    
    if (isVertical) {
      line.style.left = `${displayPos}px`;
      line.style.top = `${this.offset.y}px`;
      line.style.height = `${currentImage.height * this.scale}px`;
    } else {
      line.style.top = `${displayPos}px`;
      line.style.left = `${this.offset.x}px`;
      line.style.width = `${currentImage.width * this.scale}px`;
    }

    this.makeDraggable(line, isVertical);
    return line;
  }

  // 计算显示位置
  getDisplayPosition(position, isVertical) {
    return this.offset[isVertical ? 'x' : 'y'] + position * this.scale;
  }

  // 从显示位置计算实际位置
  getRealPosition(displayPos, isVertical) {
    return (displayPos - this.offset[isVertical ? 'x' : 'y']) / this.scale;
  }

  // 使切割线可拖动
  makeDraggable(line, isVertical) {
    let startPos = 0;
    let originalPos = 0;
    let moveTimer = null; // 添加防抖定时器

    const onMouseDown = (e) => {
      e.preventDefault();
      startPos = isVertical ? e.clientX : e.clientY;
      originalPos = parseInt(isVertical ? line.style.left : line.style.top);
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      const currentPos = isVertical ? e.clientX : e.clientY;
      const delta = currentPos - startPos;
      const newPos = originalPos + delta;
      
      // 限制移动范围
      const containerRect = this.container.getBoundingClientRect();
      const min = isVertical ? this.offset.x : this.offset.y;
      const max = isVertical ? 
        containerRect.width - this.offset.x : 
        containerRect.height - this.offset.y;
      
      const limitedPos = Math.max(min, Math.min(newPos, max));
      
      if (isVertical) {
        line.style.left = `${limitedPos}px`;
      } else {
        line.style.top = `${limitedPos}px`;
      }

      // 使用防抖处理更新
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const realPos = this.getRealPosition(limitedPos, isVertical);
        this.onLineMove(realPos, isVertical);
      }, 100); // 100ms 的防抖延迟
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // 确保最后一次更新一定会执行
      if (moveTimer) {
        clearTimeout(moveTimer);
        const limitedPos = parseInt(isVertical ? line.style.left : line.style.top);
        const realPos = this.getRealPosition(limitedPos, isVertical);
        this.onLineMove(realPos, isVertical);
      }
    };

    line.addEventListener('mousedown', onMouseDown);
  }

  // 更新切割线
  updateLines(verticalLines, horizontalLines) {
    this.clearLines();
    
    // 添加边界线
    verticalLines.unshift(0);
    verticalLines.push(currentImage.width);
    horizontalLines.unshift(0);
    horizontalLines.push(currentImage.height);

    verticalLines.forEach(pos => {
      const line = this.createLine(pos, true);
      this.container.appendChild(line);
      this.lines.set(line, { position: pos, isVertical: true });
    });

    horizontalLines.forEach(pos => {
      const line = this.createLine(pos, false);
      this.container.appendChild(line);
      this.lines.set(line, { position: pos, isVertical: false });
    });
  }

  // 清除所有切割线
  clearLines() {
    this.lines.forEach((_, line) => line.remove());
    this.lines.clear();
  }

  // 获取当前切割线位置
  getLinePositions() {
    const vertical = [];
    const horizontal = [];
    
    this.lines.forEach((info, line) => {
      const pos = this.getRealPosition(
        parseInt(info.isVertical ? line.style.left : line.style.top),
        info.isVertical
      );
      if (info.isVertical) {
        vertical.push(pos);
      } else {
        horizontal.push(pos);
      }
    });

    return {
      vertical: vertical.sort((a, b) => a - b),
      horizontal: horizontal.sort((a, b) => a - b)
    };
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const preview = document.getElementById('preview');
  const sliceMode = document.getElementById('sliceMode');
  const uniformControls = document.getElementById('uniformControls');
  const customControls = document.getElementById('customControls');
  const previewBtn = document.getElementById('previewBtn');
  const sliceBtn = document.getElementById('sliceBtn');

  // 处理拖拽上传
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    handleImage(file);
  });

  // 处理点击上传
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    handleImage(file);
  });

  // 切割模式切换
  sliceMode.addEventListener('change', () => {
    const autoTip = document.getElementById('autoTip');
    
    // 清除预览效果
    clearPreview();
    
    // 清除自动识别模式的切割线
    const imageContainer = document.querySelector('.image-container');
    if (imageContainer.guideLines) {
      imageContainer.guideLines.clearLines();
      delete imageContainer.guideLines;
    }
    
    if (sliceMode.value === 'auto') {
      // 自动识别模式：隐藏所有参数输入，显示提示
      uniformControls.hidden = true;
      customControls.hidden = true;
      autoTip.hidden = false;
    } else {
      // 其他模式：根据选择显示对应的控件，隐藏提示
      uniformControls.hidden = sliceMode.value === 'custom';
      customControls.hidden = sliceMode.value === 'uniform';
      autoTip.hidden = true;
    }
  });

  // 预览按钮
  previewBtn.addEventListener('click', () => {
    if (!currentImage) return;
    
    clearPreview();

    const imageContainer = document.querySelector('.image-container');
    const rect = imageContainer.getBoundingClientRect();
    
    // 计算预览图片的实际显示尺寸和位置
    const previewRect = preview.getBoundingClientRect();
    const scale = Math.min(
      previewRect.width / currentImage.width,
      previewRect.height / currentImage.height
    );
    
    const displayWidth = currentImage.width * scale;
    const displayHeight = currentImage.height * scale;
    
    const offsetX = (rect.width - displayWidth) / 2;
    const offsetY = (rect.height - displayHeight) / 2;

    if (sliceMode.value === 'auto') {
      // 自动识别模式
      const result = autoDetectSlices(currentImage);
      
      // 创建可调整的切割线
      const guideLines = new AdjustableGuideLines(imageContainer, {
        scale: scale,
        offset: { x: offsetX, y: offsetY },
        onLineMove: (position, isVertical) => {
          // 当切割线移动时更新切片信息
          const positions = guideLines.getLinePositions();
          updateSlicePreview(positions.vertical, positions.horizontal);
        }
      });

      // 添加切割线
      guideLines.updateLines(
        result.verticalLines.slice(1, -1), // 排除边界线
        result.horizontalLines.slice(1, -1)
      );

      // 保存引用以便后续使用
      imageContainer.guideLines = guideLines;

      // 显示切片信息
      showMessage(`自动识别到 ${result.slices.length} 个切片`);
    } else {
      // 均匀切割和自定义尺寸的预览逻辑
      let rows, cols;
      if (sliceMode.value === 'uniform') {
        rows = parseInt(document.getElementById('rows').value);
        cols = parseInt(document.getElementById('cols').value);
      } else {
        const sliceWidth = parseInt(document.getElementById('sliceWidth').value);
        const sliceHeight = parseInt(document.getElementById('sliceHeight').value);
        rows = Math.ceil(currentImage.height / sliceHeight);
        cols = Math.ceil(currentImage.width / sliceWidth);
      }

      // 创建预览画布
      const canvas = document.createElement('canvas');
      canvas.className = 'preview-canvas';
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');

      // 设置切割线样式
      ctx.strokeStyle = '#FF4081';
      ctx.lineWidth = 1;

      // 限制绘制区域到图片范围内
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, offsetY, displayWidth, displayHeight);
      ctx.clip();

      // 绘制垂直线
      for (let i = 1; i < cols; i++) {
        const x = offsetX + (displayWidth / cols) * i;
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + displayHeight);
      }

      // 绘制水平线
      for (let i = 1; i < rows; i++) {
        const y = offsetY + (displayHeight / rows) * i;
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + displayWidth, y);
      }

      // 完成绘制
      ctx.stroke();
      ctx.restore();

      // 添加画布到容器
      imageContainer.appendChild(canvas);

      // 显示切割信息
      showMessage(`将被切割成 ${rows}×${cols} = ${rows * cols} 张图片`);
    }
  });

  // 切割按钮
  sliceBtn.addEventListener('click', () => {
    if (!currentImage) return;
    sliceImage();
  });

  // 处理图片
  function handleImage(file) {
    if (!file) {
      showMessage('请选择图片文件', true);
      return;
    }

    if (!file.type.startsWith('image/')) {
      showMessage('请选择有效的图片文件', true);
      return;
    }

    // 先重置当前状态
    resetUpload();

    // 直接创建一个临时的 URL
    const objectUrl = URL.createObjectURL(file);
    
    // 创建新的图片对象
    const tempImage = new Image();
    
    tempImage.onload = () => {
      currentImage = tempImage;
      preview.src = objectUrl;
      preview.hidden = false;
      dropZone.hidden = true;
      
      document.querySelector('.image-container').classList.add('has-image');
      
      showImageInfo({
        width: tempImage.width,
        height: tempImage.height,
        type: file.type.replace('image/', '').toUpperCase()
      });
      
      showMessage('图片上传成功！');
      previewBtn.disabled = false;
      sliceBtn.disabled = false;
    };

    tempImage.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      showMessage('图片加载失败，请重试', true);
      resetUpload();
    };

    // 设置图片源
    tempImage.src = objectUrl;
  }

  // 添加计算切片的函数
  function calculateSlices(verticalLines, horizontalLines) {
    // 确保边界线存在
    if (!verticalLines.includes(0)) verticalLines.unshift(0);
    if (!verticalLines.includes(currentImage.width)) verticalLines.push(currentImage.width);
    if (!horizontalLines.includes(0)) horizontalLines.unshift(0);
    if (!horizontalLines.includes(currentImage.height)) horizontalLines.push(currentImage.height);

    // 排序确保顺序
    verticalLines.sort((a, b) => a - b);
    horizontalLines.sort((a, b) => a - b);

    const slices = [];
    for (let i = 0; i < horizontalLines.length - 1; i++) {
      for (let j = 0; j < verticalLines.length - 1; j++) {
        const x = verticalLines[j];
        const y = horizontalLines[i];
        const width = verticalLines[j + 1] - x;
        const height = horizontalLines[i + 1] - y;
        
        // 忽略太小的切片
        if (width < 10 || height < 10) continue;
        
        slices.push({ x, y, width, height });
      }
    }
    return slices;
  }

  // 修改切割图片函数
  function sliceImage() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let slices = [];

    if (sliceMode.value === 'auto') {
      const imageContainer = document.querySelector('.image-container');
      if (imageContainer.guideLines) {
        const positions = imageContainer.guideLines.getLinePositions();
        slices = calculateSlices(
          positions.vertical,
          positions.horizontal
        );
      } else {
        // 如果没有引导线，使用自动检测的结果
        const result = autoDetectSlices(currentImage);
        slices = result.slices;
      }
    } else {
      // 均匀切割或自定义尺寸的逻辑
      let rows, cols, sliceWidth, sliceHeight;
      
      if (sliceMode.value === 'uniform') {
        rows = parseInt(document.getElementById('rows').value);
        cols = parseInt(document.getElementById('cols').value);
        sliceWidth = currentImage.width / cols;
        sliceHeight = currentImage.height / rows;
      } else {
        sliceWidth = parseInt(document.getElementById('sliceWidth').value);
        sliceHeight = parseInt(document.getElementById('sliceHeight').value);
        rows = Math.ceil(currentImage.height / sliceHeight);
        cols = Math.ceil(currentImage.width / sliceWidth);
      }

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const x = j * sliceWidth;
          const y = i * sliceHeight;
          const width = Math.min(sliceWidth, currentImage.width - x);
          const height = Math.min(sliceHeight, currentImage.height - y);
          
          if (width < 10 || height < 10) continue;
          
          slices.push({ x, y, width, height });
        }
      }
    }

    // 如果没有切片，显示错误
    if (slices.length === 0) {
      showMessage('没有找到有效的切片', true);
      return;
    }

    // 创建zip文件
    const zip = new JSZip();
    let processedCount = 0;

    // 显示进度信息
    showMessage(`开始处理 ${slices.length} 个切片...`);

    // 处理每个切片
    slices.forEach((slice, index) => {
      canvas.width = slice.width;
      canvas.height = slice.height;
      
      ctx.drawImage(
        currentImage,
        slice.x, slice.y,
        slice.width, slice.height,
        0, 0,
        slice.width, slice.height
      );

      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      
      zip.file(`slice_${index + 1}.png`, base64Data, {base64: true});
      
      processedCount++;
      if (processedCount === slices.length) {
        // 所有切片处理完成，生成并下载zip
        zip.generateAsync({type: "blob"})
          .then(function(content) {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sliced_images.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showMessage('切割完成！');
          })
          .catch(function(error) {
            showMessage('生成zip文件时出错：' + error.message, true);
          });
      }
    });
  }

  // 添加重置功能
  function resetUpload() {
    clearPreview();
    if (preview.src) {
      URL.revokeObjectURL(preview.src);
    }
    currentImage = null;
    preview.src = '';
    preview.hidden = true;
    dropZone.hidden = false;
    dropZone.classList.remove('dragover');
    fileInput.value = '';
    
    document.querySelector('.image-container').classList.remove('has-image');
    
    previewBtn.disabled = true;
    sliceBtn.disabled = true;
    
    const imageInfo = document.querySelector('.image-info');
    if (imageInfo) {
      imageInfo.remove();
    }
  }

  // 添加重置按钮到HTML
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn';
  resetBtn.textContent = '重新上传';
  resetBtn.onclick = resetUpload;
  document.querySelector('.controls').insertBefore(resetBtn, document.querySelector('#previewBtn'));

  // 初始化时禁用按钮
  previewBtn.disabled = true;
  sliceBtn.disabled = true;

  addPreviewStyles();

  // 初始化时显示自动识别模式的提示
  const autoTip = document.getElementById('autoTip');
  uniformControls.hidden = true;
  customControls.hidden = true;
  autoTip.hidden = false;
}); 

// 添加一个防抖函数
let updatePreviewTimer = null;

function updateSlicePreview(verticalLines, horizontalLines) {
  // 清除之前的定时器
  if (updatePreviewTimer) {
    clearTimeout(updatePreviewTimer);
  }

  // 使用防抖延迟更新提示信息
  updatePreviewTimer = setTimeout(() => {
    // 更新切片信息
    const slices = [];
    
    // 添加图片边界
    verticalLines.unshift(0);
    verticalLines.push(currentImage.width);
    horizontalLines.unshift(0);
    horizontalLines.push(currentImage.height);

    // 计算切片
    for (let i = 0; i < horizontalLines.length - 1; i++) {
      for (let j = 0; j < verticalLines.length - 1; j++) {
        const x = verticalLines[j];
        const y = horizontalLines[i];
        const width = verticalLines[j + 1] - x;
        const height = horizontalLines[i + 1] - y;
        
        if (width < 10 || height < 10) continue;
        
        slices.push({ x, y, width, height });
      }
    }

    // 更新提示信息
    showMessage(`当前切割方案：${slices.length} 个切片`);
  }, 300); // 300ms 的防抖延迟
} 