export enum LIVE_COMMANDS {
  START_SCREENCAST = 'Page.startScreencast',
  STOP_SCREENCAST = 'Page.stopScreencast',
  SCREENCAST_FRAME = 'Page.screencastFrame',
  SCREENCAST_FRAME_ACK = 'Page.screencastFrameAck',
  INPUT_EMULATE_TOUCH_FROM_MOUSE_EVENT = 'Input.emulateTouchFromMouseEvent',
  INPUT_DISPATCH_KEY_EVENT = 'Input.dispatchKeyEvent',
}

export enum SPECIAL_COMMANDS {
  SET_VIEWPORT = 'Page.setViewport',
  GO_BACK = 'Page.goBack',
  GO_FORWARD = 'Page.goForward',
  RELOAD = 'Page.reload',
  GET_URL = 'Page.getUrl',
}
