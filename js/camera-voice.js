// camera-voice.js — 拍照 + 语音识别

// ---------- 拍照 ----------

/**
 * 触发拍照，返回 base64 Data URL
 * 在 iOS Safari 上使用 capture="environment" 调起后置摄像头
 */
function takePhoto() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = () => {
      const file = input.files[0];
      if (!file) {
        return reject(new Error('未选择照片'));
      }

      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取照片失败'));
      reader.readAsDataURL(file);
    };

    input.click();
  });
}

/**
 * 将 base64 图片压缩到指定最大宽度（保持比例）
 * 存储时保留原图，生成 docx 时用此函数压缩
 */
function resizeImage(dataUrl, maxWidth = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxWidth) {
        resolve(dataUrl);
        return;
      }
      const ratio = maxWidth / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

// ---------- 语音识别 ----------

/**
 * 使用 Web Speech API 进行语音识别
 * iOS Safari 15+ 支持
 */
function startVoiceRecognition({ onResult, onInterim, onEnd, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError(new Error('您的浏览器不支持语音识别'));
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalText += result[0].transcript;
      } else {
        interimText += result[0].transcript;
      }
    }

    if (finalText) {
      onResult(finalText);
    }
    if (interimText) {
      onInterim(interimText);
    }
  };

  recognition.onerror = (event) => {
    switch (event.error) {
      case 'not-allowed':
        onError(new Error('麦克风权限被拒绝，请在设置中允许'));
        break;
      case 'no-speech':
        onError(new Error('未检测到语音，请重试'));
        break;
      case 'aborted':
        break;
      default:
        onError(new Error(`语音识别错误: ${event.error}`));
    }
  };

  recognition.onend = () => {
    onEnd();
  };

  recognition.start();
  return recognition;
}

export { takePhoto, resizeImage, startVoiceRecognition };
