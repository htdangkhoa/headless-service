export enum LIVE_COMMANDS {
  START_SCREENCAST = 'Page.startScreencast',
  STOP_SCREENCAST = 'Page.stopScreencast',
  SCREENCAST_FRAME = 'Page.screencastFrame',
  SCREENCAST_FRAME_ACK = 'Page.screencastFrameAck',
  INPUT_EMULATE_TOUCH_FROM_MOUSE_EVENT = 'Input.emulateTouchFromMouseEvent',
  INPUT_DISPATCH_KEY_EVENT = 'Input.dispatchKeyEvent',
}

export enum LIVE_EVENT_NAMES {
  FRAME_NAVIGATED = 'Page.frameNavigated',
}

export enum SPECIAL_COMMANDS {
  SET_VIEWPORT = 'Page.setViewport',
  GO_BACK = 'Page.goBack',
  GO_FORWARD = 'Page.goForward',
  RELOAD = 'Page.reload',
}

export enum CUSTOM_COMMANDS {
  REGISTER_SCREENCAST = 'Live.registerScreencast',
  RENDER_TABS = 'Live.renderTabs',
  GO_TO_TAB = 'Live.goToTab',
  CLOSE_TAB = 'Live.closeTab',
  KEEP_ALIVE = 'Live.keepAlive',
}

export const DEFAULT_KEEP_ALIVE_TIMEOUT = 1000 * 60 * 5; // 5 minutes
