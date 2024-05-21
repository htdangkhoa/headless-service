import { debounce } from 'lodash';

import { LIVE_COMMANDS, SPECIAL_COMMANDS } from '@/constants';
import { Dictionary } from '@/types';

const MOUSE_BUTTONS = ['none', 'left', 'middle', 'right'];

const MOUSE_EVENTS: Dictionary<string> = {
  mousedown: 'mousePressed',
  mouseup: 'mouseReleased',
  mousewheel: 'mouseWheel',
  touchstart: 'mousePressed',
  touchend: 'mouseReleased',
  touchmove: 'mouseWheel',
  mousemove: 'mouseMoved',
};

export class ScreencastView {
  private $viewer: HTMLDivElement;
  private $canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image = new Image();

  private ws: WebSocket;

  constructor(private container: HTMLElement) {
    container.classList.add('flex-auto', 'widget', 'vbox');

    this.$viewer = document.createElement('div');
    this.$viewer.classList.add('flex', 'flex-1');

    this.$canvas = document.createElement('canvas');
    this.ctx = this.$canvas.getContext('2d')!;

    this.$viewer.appendChild(this.$canvas);
    container.appendChild(this.$viewer);

    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = location.href.replace(location.protocol, wsProtocol);
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener('open', this.onOpen.bind(this));
    this.ws.addEventListener('message', this.onMessage.bind(this));
    this.ws.addEventListener('close', this.onClose.bind(this));
    this.ws.addEventListener('error', this.onError.bind(this));
  }

  private getModifiersForEvent(event: any) {
    return (
      // eslint-disable-next-line no-bitwise
      (event.altKey ? 1 : 0) |
      (event.ctrlKey ? 2 : 0) |
      (event.metaKey ? 4 : 0) |
      (event.shiftKey ? 8 : 0)
    );
  }

  private resizeWindow = debounce(
    () => {
      console.log('resize window');

      const { width, height } = window.document.body.getBoundingClientRect();

      this.$canvas.width = width;
      this.$canvas.height = height;

      const params = {
        width: Math.floor(width),
        height: Math.floor(height),
        deviceScaleFactor: 1,
        mobile: true,
      };

      this.sendCommand(SPECIAL_COMMANDS.SET_VIEWPORT, params);
    },
    500,
    { leading: true, trailing: true }
  );

  private onMouseEvent(event: MouseEvent) {
    const evt: any = event.type === 'mousewheel' ? window.event || event : event;

    if (!(evt.type in MOUSE_EVENTS)) {
      return;
    }

    if (
      evt.type !== 'mousewheel' &&
      MOUSE_BUTTONS[evt.which] === 'none' &&
      evt.type !== 'mousemove'
    ) {
      return;
    }

    const type = MOUSE_EVENTS[evt.type] as string;
    const isScroll = type.indexOf('wheel') !== -1;
    const x = isScroll ? evt.clientX : evt.offsetX;
    const y = isScroll ? evt.clientY : evt.offsetY;

    const params: Dictionary<any> = {
      type: MOUSE_EVENTS[evt.type],
      x,
      y,
      modifiers: this.getModifiersForEvent(evt),
      button: evt.type === 'mousewheel' ? 'none' : MOUSE_BUTTONS[evt.which],
      clickCount: 1,
    };

    if (evt.type === 'mousewheel') {
      params.deltaX = evt.wheelDeltaX || 0;
      params.deltaY = evt.wheelDeltaY || evt.wheelDelta;
    }

    this.sendCommand(LIVE_COMMANDS.INPUT_EMULATE_TOUCH_FROM_MOUSE_EVENT, params);
  }

  private sendCommand(command: string, params: Dictionary<any> = {}) {
    this.ws.send(JSON.stringify({ command, params }));
  }

  async onOpen(event: Event) {
    console.log('on open');

    // add event listener
    window.addEventListener('resize', this.resizeWindow.bind(this), false);
    this.$canvas.addEventListener('mousedown', this.onMouseEvent.bind(this), false);
    this.$canvas.addEventListener('mouseup', this.onMouseEvent.bind(this), false);
    // @ts-ignore
    this.$canvas.addEventListener('mousewheel', this.onMouseEvent.bind(this), false);
    this.$canvas.addEventListener('mousemove', this.onMouseEvent.bind(this), false);

    const self = this;
    const onKeyEvent = (event: KeyboardEvent) => {
      let type: 'keyDown' | 'keyUp' | 'char';

      switch (event.type) {
        case 'keydown':
          type = 'keyDown';
          break;
        case 'keyup':
          type = 'keyUp';
          break;
        case 'keypress':
          type = 'char';
          break;
        default:
          return;
      }

      const text = type === 'char' ? String.fromCharCode(event.charCode) : undefined;

      const params = {
        type,
        modifiers: self.getModifiersForEvent(event),
        timestamp: event.timeStamp,
        text,
        unmodifiedText: text,
        keyIdentifier: `U+${event.keyCode.toString(16).toUpperCase()}`,
        code: event.code,
        key: text,
        location: event.location,
      };

      self.sendCommand(LIVE_COMMANDS.INPUT_DISPATCH_KEY_EVENT, params);
    };

    this.$canvas.addEventListener('mouseover', () => {
      document.addEventListener('keydown', onKeyEvent);
      document.addEventListener('keyup', onKeyEvent);
      document.addEventListener('keypress', onKeyEvent);
    });

    this.$canvas.addEventListener('mouseleave', () => {
      document.removeEventListener('keydown', onKeyEvent);
      document.removeEventListener('keyup', onKeyEvent);
      document.removeEventListener('keypress', onKeyEvent);
    });

    // initialize
    this.resizeWindow();

    this.sendCommand(LIVE_COMMANDS.START_SCREENCAST, {
      format: 'jpeg',
      quality: 100,
      everyNthFrame: 1,
    });
  }

  async onMessage(event: MessageEvent) {
    console.log('on message');

    const text = event.data;

    const { data } = JSON.parse(text);

    this.image.onload = () => {
      this.ctx.drawImage(this.image, 0, 0, this.$canvas.width, this.$canvas.height);
    };
    this.image.src = `data:image/jpeg;base64,${data.data}`;
    this.sendCommand(LIVE_COMMANDS.SCREENCAST_FRAME_ACK, { sessionId: data.sessionId });
  }

  async onClose(event: CloseEvent) {}

  async onError(event: Event) {}
}
