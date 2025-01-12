let currentImage = null;

function showMessage(message, isError = false) {
  const existingMsg = document.querySelector('.message');
  if (existingMsg) {
    existingMsg.remove();
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isError ? 'error' : 'success'}`;
  msgDiv.textContent = message;
  document.querySelector('.container').insertBefore(msgDiv, document.querySelector('.controls'));
  
  setTimeout(() => msgDiv.remove(), 3000);
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
    .preview-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
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
    clearPreview();
  });

  // 预览按钮
  previewBtn.addEventListener('click', () => {
    if (!currentImage) return;
    
    clearPreview();

    const canvas = document.createElement('canvas');
    canvas.className = 'preview-canvas';
    const imageContainer = document.querySelector('.image-container');
    
    const rect = imageContainer.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    const ctx = canvas.getContext('2d');
    
    // 获取切割参数
    let rows, cols, slices, horizontalLines, verticalLines;
    
    if (sliceMode.value === 'auto') {
      const result = autoDetectSlices(currentImage);
      rows = result.rows;
      cols = result.cols;
      slices = result.slices;
      horizontalLines = result.horizontalLines;
      verticalLines = result.verticalLines;
    } else {
      // 原有的均匀切割和自定义尺寸逻辑
      if (sliceMode.value === 'uniform') {
        rows = parseInt(document.getElementById('rows').value);
        cols = parseInt(document.getElementById('cols').value);
      } else {
        sliceWidth = parseInt(document.getElementById('sliceWidth').value);
        sliceHeight = parseInt(document.getElementById('sliceHeight').value);
        rows = Math.ceil(currentImage.height / sliceHeight);
        cols = Math.ceil(currentImage.width / sliceWidth);
      }
    }

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

    // 绘制网格
    ctx.strokeStyle = '#FF4081';
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (sliceMode.value === 'auto') {
      // 绘制自动识别的切割线
      verticalLines.forEach(x => {
        const displayX = offsetX + x * scale;
        ctx.moveTo(displayX, offsetY);
        ctx.lineTo(displayX, offsetY + displayHeight);
      });

      horizontalLines.forEach(y => {
        const displayY = offsetY + y * scale;
        ctx.moveTo(offsetX, displayY);
        ctx.lineTo(offsetX + displayWidth, displayY);
      });
    } else {
      // 原有的均匀网格绘制逻辑
      for (let i = 1; i < cols; i++) {
        const x = offsetX + (displayWidth / cols) * i;
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + displayHeight);
      }

      for (let i = 1; i < rows; i++) {
        const y = offsetY + (displayHeight / rows) * i;
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + displayWidth, y);
      }
    }

    ctx.stroke();
    imageContainer.appendChild(canvas);

    // 显示切割信息
    if (sliceMode.value === 'auto') {
      showMessage(`自动识别到 ${slices.length} 个切片`);
    } else {
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
      // 保存当前图片对象
      currentImage = tempImage;
      
      // 设置预览
      preview.src = objectUrl;
      preview.hidden = false;
      dropZone.hidden = true;
      
      // 显示图片信息
      showImageInfo({
        width: tempImage.width,
        height: tempImage.height,
        type: file.type.replace('image/', '').toUpperCase()
      });
      
      showMessage('图片上传成功！');
      
      // 启用按钮
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

  // 切割图片
  function sliceImage() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    let slices;
    
    if (sliceMode.value === 'auto') {
      const result = autoDetectSlices(currentImage);
      slices = result.slices;
    } else {
      // 原有的均匀切割和自定义尺寸逻辑
      slices = [];
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
          slices.push({
            x: j * sliceWidth,
            y: i * sliceHeight,
            width: sliceWidth,
            height: sliceHeight
          });
        }
      }
    }

    // 创建zip文件
    const zip = new JSZip();

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
    });

    // 下载zip文件
    zip.generateAsync({type:"blob"}).then(function(content) {
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sliced_images.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
    
    // 禁用按钮
    previewBtn.disabled = true;
    sliceBtn.disabled = true;
    
    // 移除图片信息
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
}); 