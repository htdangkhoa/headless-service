import { debounce } from 'lodash-es';
import { X as XIcon } from 'lucide-static';
import EarthIcon from 'lucide-static/icons/earth.svg';

import {
  CUSTOM_COMMANDS,
  DEFAULT_KEEP_ALIVE_TIMEOUT,
  LIVE_COMMANDS,
  LIVE_EVENT_NAMES,
  SPECIAL_COMMANDS,
} from '@/constants/live';
import type { Dictionary } from '@/types';

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

interface ScreencastConfigs {
  format: string;
  quality: number | string;
  everyNthFrame: number | string;
}

const DEFAULT_SCREENCAST_CONFIGS: ScreencastConfigs = {
  format: 'jpeg',
  quality: 100,
  everyNthFrame: 1,
};

export class ScreencastView {
  private $tabs: HTMLDivElement;
  private $navigation: HTMLDivElement;
  private $viewer: HTMLDivElement;
  private $canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image = new Image();
  private $notification: HTMLDivElement;

  private screencastConfigs: ScreencastConfigs = DEFAULT_SCREENCAST_CONFIGS;

  private sessionId: string;
  private ws: WebSocket;

  private connectionId?: string;

  constructor(private container: HTMLElement) {
    const url = new URL(location.href);

    const format = url.searchParams.get('format') || DEFAULT_SCREENCAST_CONFIGS.format;
    const quality = url.searchParams.get('quality') || DEFAULT_SCREENCAST_CONFIGS.quality;
    const everyNthFrame =
      url.searchParams.get('everyNthFrame') || DEFAULT_SCREENCAST_CONFIGS.everyNthFrame;

    this.screencastConfigs = {
      format,
      quality,
      everyNthFrame,
    };

    this.container.classList.add('flex-auto', 'widget', 'vbox');

    /* ===== Tabs ===== */
    this.$tabs = document.createElement('div');
    this.$tabs.classList.add('flex', 'screencast-tabs');

    container.appendChild(this.$tabs);

    /* ===== Navigation ===== */
    this.$navigation = document.createElement('div');
    this.$navigation.classList.add('flex', 'screencast-navigation');

    const backButton = document.createElement('button');
    backButton.style.backgroundPositionX = '-1px';
    backButton.addEventListener('click', this.handleBack.bind(this));

    const forwardButton = document.createElement('button');
    forwardButton.style.backgroundPositionX = '-18px';
    forwardButton.addEventListener('click', this.handleForward.bind(this));

    const reloadButton = document.createElement('button');
    reloadButton.style.backgroundPositionX = '-37px';
    reloadButton.addEventListener('click', this.handleReload.bind(this));

    const input = document.createElement('input');
    input.classList.add('flex-1', 'truncate', 'px-2');
    input.type = 'text';
    input.disabled = true;

    this.$navigation.appendChild(backButton);
    this.$navigation.appendChild(forwardButton);
    this.$navigation.appendChild(reloadButton);
    this.$navigation.appendChild(input);

    container.appendChild(this.$navigation);

    /* ===== Viewer ===== */
    this.$viewer = document.createElement('div');
    this.$viewer.classList.add('flex', 'flex-1');

    this.$canvas = document.createElement('canvas');
    this.ctx = this.$canvas.getContext('2d')!;

    this.$notification = document.createElement('div');
    this.$notification.classList.add('absolute', 'top-50', 'left-50', 'translate-n50', 'hidden');

    this.$viewer.appendChild(this.$canvas);
    this.$viewer.appendChild(this.$notification);
    container.appendChild(this.$viewer);

    this.sessionId = url.searchParams.get('session')!;
    const wsUrl = url.href.replace(/^http/, 'ws');
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

    const params: Dictionary = {
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

  private sendCommand(command: string, params: Dictionary = {}) {
    this.ws.send(
      JSON.stringify({
        command,
        params,
        context: {
          sessionId: this.sessionId,
          connectionId: this.connectionId,
        },
      })
    );
  }

  private getNavigationInput() {
    return this.$navigation.querySelector<HTMLInputElement>('input');
  }

  private handleBack(e: MouseEvent) {
    e.preventDefault();

    this.sendCommand(SPECIAL_COMMANDS.GO_BACK);
  }

  private handleForward(e: MouseEvent) {
    e.preventDefault();

    this.sendCommand(SPECIAL_COMMANDS.GO_FORWARD);
  }

  private handleReload(e: MouseEvent) {
    e.preventDefault();

    this.sendCommand(SPECIAL_COMMANDS.RELOAD);
  }

  async onOpen(_event: Event) {
    const previousConnectionId = sessionStorage.getItem('connection-id');
    this.connectionId = previousConnectionId || window.crypto.randomUUID();
    sessionStorage.setItem('connection-id', this.connectionId);

    this.sendCommand(CUSTOM_COMMANDS.REGISTER_SCREENCAST, {
      connectionId: this.connectionId,
    });

    setInterval(
      () => {
        this.sendCommand(CUSTOM_COMMANDS.KEEP_ALIVE, {
          ms: DEFAULT_KEEP_ALIVE_TIMEOUT,
        });
      },
      1000 * 60 * 3 // 3 minutes
    );

    // hide notification
    this.$notification.classList.contains('hidden') || this.$notification.classList.add('hidden');

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

    const onMouseOver = () => {
      document.addEventListener('keydown', onKeyEvent);
      document.addEventListener('keyup', onKeyEvent);
      document.addEventListener('keypress', onKeyEvent);
    };
    this.$canvas.addEventListener('mouseover', onMouseOver);

    const onMouseLeave = () => {
      document.removeEventListener('keydown', onKeyEvent);
      document.removeEventListener('keyup', onKeyEvent);
      document.removeEventListener('keypress', onKeyEvent);
    };
    this.$canvas.addEventListener('mouseleave', onMouseLeave);

    const beforeUnload = (event: BeforeUnloadEvent) => {
      // event.preventDefault();
      // event.returnValue = '';

      if (this.connectionId) {
        sessionStorage.setItem('connection-id', this.connectionId);
      }

      // window.removeEventListener('resize', this.resizeWindow);
      // window.removeEventListener('beforeunload', beforeUnload);

      // this.$canvas.removeEventListener('mousedown', this.onMouseEvent);
      // this.$canvas.removeEventListener('mouseup', this.onMouseEvent);
      // // @ts-ignore
      // this.$canvas.removeEventListener('mousewheel', this.onMouseEvent);
      // this.$canvas.removeEventListener('mousemove', this.onMouseEvent);

      // this.$canvas.removeEventListener('mouseover', onMouseOver);
      // this.$canvas.removeEventListener('mouseleave', onMouseLeave);

      // document.removeEventListener('keydown', onKeyEvent);
      // document.removeEventListener('keyup', onKeyEvent);
      // document.removeEventListener('keypress', onKeyEvent);

      // this.sendCommand(LIVE_COMMANDS.STOP_SCREENCAST);

      // this.ws.removeEventListener('open', this.onOpen);
      // this.ws.removeEventListener('message', this.onMessage);
      // this.ws.removeEventListener('close', this.onClose);
      // this.ws.removeEventListener('error', this.onError);

      // if (this.ws.readyState !== WebSocket.CLOSED) {
      //   this.ws.close();
      // }
    };
    window.addEventListener('beforeunload', beforeUnload);

    // initialize
    this.resizeWindow();

    // this.sendCommand(SPECIAL_COMMANDS.GET_URL);
    // this.sendCommand(LIVE_COMMANDS.START_SCREENCAST, this.screencastConfigs);
  }

  async onMessage(event: MessageEvent) {
    const text = event.data;

    const { context, command, data } = JSON.parse(text);

    if (context?.connectionId !== this.connectionId) return;

    switch (command) {
      case CUSTOM_COMMANDS.RENDER_TABS: {
        this.$tabs.innerHTML = '';
        data.forEach((tab: any) => {
          const tabItem = this.createTabItem.call(this, tab);
          this.$tabs.appendChild(tabItem);
        });
        this.resizeWindow();
        break;
      }
      case LIVE_COMMANDS.SCREENCAST_FRAME: {
        this.image.onload = () => {
          this.ctx.drawImage(this.image, 0, 0, this.$canvas.width, this.$canvas.height);
        };
        this.image.src = `data:image/jpeg;base64,${data.data}`;
        this.sendCommand(LIVE_COMMANDS.SCREENCAST_FRAME_ACK, { sessionId: data.sessionId });
        break;
      }
      case LIVE_EVENT_NAMES.FRAME_NAVIGATED: {
        const input = this.$navigation.querySelector('input') as HTMLInputElement;
        input.value = data.url;

        const tabItem = this.$tabs.querySelector<HTMLDivElement>(`#tab-${data.targetId}`);
        if (tabItem) {
          tabItem.title = data.title;

          const titleEle = tabItem.querySelector('span.title');
          if (titleEle) {
            titleEle.textContent = data.title;
          }

          const faviconEle = tabItem.querySelector<HTMLImageElement>('img.favicon');
          if (faviconEle) {
            faviconEle.src = data.favicon || EarthIcon;
          }
        }
        break;
      }
    }
  }

  async onClose(_event: CloseEvent) {
    // clear canvas
    this.ctx.clearRect(0, 0, this.$canvas.width, this.$canvas.height);

    // clear input
    this.getNavigationInput()!.value = '';

    // show notification
    this.$notification.classList.remove('hidden');
    this.$notification.textContent = 'Session closed';
  }

  async onError(_event: Event) {
    // clear canvas
    this.ctx.clearRect(0, 0, this.$canvas.width, this.$canvas.height);

    // clear input
    this.getNavigationInput()!.value = '';

    // show notification
    this.$notification.classList.remove('hidden');
    this.$notification.textContent = 'An error occurred';
  }

  private createTabItem(tab: any) {
    const defaultTitle = `Untitled`;

    const tabItem = document.createElement('div');
    tabItem.id = `tab-${tab.targetId}`;
    tabItem.title = defaultTitle;
    tabItem.classList.add('screencast-tab-item');
    if (tab.active) {
      tabItem.classList.add('active');
    }
    tabItem.addEventListener('click', () => {
      this.sendCommand(CUSTOM_COMMANDS.GO_TO_TAB, { targetId: tab.targetId });
    });

    const tabItemIcon = document.createElement('img');
    tabItemIcon.classList.add('favicon');
    tabItemIcon.src = EarthIcon;
    tabItem.appendChild(tabItemIcon);

    const tabItemText = document.createElement('span');
    tabItemText.classList.add('title');
    tabItemText.textContent = defaultTitle;
    tabItem.appendChild(tabItemText);

    const tabItemCloseButton = document.createElement('div');
    tabItemCloseButton.classList.add('close-button');
    tabItemCloseButton.role = 'button';
    tabItemCloseButton.innerHTML = XIcon;
    tabItemCloseButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sendCommand(CUSTOM_COMMANDS.CLOSE_TAB, { targetId: tab.targetId });
    });
    tabItem.appendChild(tabItemCloseButton);

    return tabItem;
  }
}
