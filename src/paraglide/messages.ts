/* eslint-disable camelcase */
import { languageTag } from './runtime'

const messages = {
  en: {
    drop_zone: 'Choose or drag an old photo here',
    try_it_images: 'Try sample images:',
    feedback: 'About',
    start_new: 'Start new',
    bruch_size: 'Brush Size',
    original: 'Original',
    upscale: '4x-upscaling',
    download: 'Download',
    undo: 'Undo',
    inpaint_model_download_message:
      'Downloading the local repair model. Your photos are not uploaded.',
    upscaleing_model_download_message:
      'Downloading the local 4x upscaling model. Your photos are not uploaded.',
  },
  zh: {
    drop_zone: '选择或拖拽一张老照片到这里',
    try_it_images: '试用示例图片:',
    feedback: '关于',
    start_new: '开始新的',
    bruch_size: '刷子大小',
    original: '原图',
    upscale: '4 倍放大',
    download: '下载',
    undo: '撤销',
    inpaint_model_download_message:
      '正在下载本地修复模型。你的照片不会被上传。',
    upscaleing_model_download_message:
      '正在下载本地 4 倍放大模型。你的照片不会被上传。',
  },
}

type MessageKey = keyof typeof messages.en

function getMessage(key: MessageKey) {
  return messages[languageTag()][key]
}

export const drop_zone = () => getMessage('drop_zone')
export const try_it_images = () => getMessage('try_it_images')
export const feedback = () => getMessage('feedback')
export const start_new = () => getMessage('start_new')
export const bruch_size = () => getMessage('bruch_size')
export const original = () => getMessage('original')
export const upscale = () => getMessage('upscale')
export const download = () => getMessage('download')
export const undo = () => getMessage('undo')
export const inpaint_model_download_message = () =>
  getMessage('inpaint_model_download_message')
export const upscaleing_model_download_message = () =>
  getMessage('upscaleing_model_download_message')
