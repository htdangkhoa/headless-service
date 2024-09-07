import { env } from '@/utils';

export const EXTENSION_TITLE = env('SERVICE_NAME', '')?.concat('Cam').trim();

export const RECORDER_ACTIONS = {
  REC_CLIENT_PLAY: 'REC_CLIENT_PLAY',
  REC_STOP: 'REC_STOP',
  SET_EXPORT_PATH: 'SET_EXPORT_PATH',
} as const;

export const CUSTOM_EVENT_NAMES = {
  DOWNLOAD_COMPLETE: 'DOWNLOAD_COMPLETE',
} as const;
