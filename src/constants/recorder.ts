import { env } from '@/utils/env';

export const EXTENSION_TITLE = env('SERVICE_NAME', '')!.concat('Cam').trim();

export const ACTIONS = {
  REC_START: 'REC_START',
  REC_STOP: 'REC_STOP',
} as const;

export const CUSTOM_EVENT_NAME = 'headless:download_complete';
