import { debounce } from 'lodash-es';
import { CircleStop as CircleStopIcon, X as XIcon } from 'lucide-static';
import EarthIcon from 'lucide-static/icons/earth.svg';
import LoadingIcon from 'lucide-static/icons/loader-circle.svg';

import { LIVE_CLIENT } from '@/constants/live';
import type { Dictionary } from '@/types';
import { LiveMessage } from '@/types/live';

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

// const DEFAULT_SCREENCAST_CONFIGS: ScreencastConfigs = {
//   format: 'jpeg',
//   quality: 100,
//   everyNthFrame: 1,
// };

export class ScreencastView {
  private $tabs: HTMLDivElement;
  private $navigation: HTMLDivElement;
  private $viewer: HTMLDivElement;
  private $canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image = new Image();
  private $notification: HTMLDivElement;

  private session: string;
  private ws: WebSocket;

  private connectionId?: string;

  private interval: NodeJS.Timeout | null = null;
  private renewSessionRetryCount = 0;
  private maxRetries = 3;
  private renewSessionTimeout: NodeJS.Timeout | null = null;
  private lastRenewTime: number = 0;

  constructor(private container: HTMLElement) {
    const url = new URL(location.href);

    this.container.classList.add('flex-auto', 'widget', 'vbox');

    /* ===== Tabs ===== */
    this.$tabs = document.createElement('div');
    this.$tabs.classList.add('flex', 'screencast-tabs');
    this.$tabs.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY === 0) return; // ignore pure horizontal scroll
        e.preventDefault(); // prevent vertical page scroll
        this.$tabs.scrollLeft += e.deltaY; // scroll horizontally
      },
      { passive: false }
    );

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

    const stopButton = document.createElement('button');
    stopButton.innerHTML = CircleStopIcon;
    const span = document.createElement('span');
    span.textContent = 'Stop';
    stopButton.append(span);
    stopButton.classList.add('flex', 'items-center');
    stopButton.style.gap = '4px';
    stopButton.style.width = 'auto';
    stopButton.style.color = '#ff5449';
    stopButton.addEventListener('click', this.handleStop.bind(this));

    this.$navigation.appendChild(backButton);
    this.$navigation.appendChild(forwardButton);
    this.$navigation.appendChild(reloadButton);
    this.$navigation.appendChild(input);
    this.$navigation.appendChild(stopButton);

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

    this.session = url.searchParams.get('session')!;
    const wsEndpoint = url.searchParams.get('ws') ?? location.href;

    const wsUrl = new URL(wsEndpoint);
    wsUrl.search = url.search;
    const finalWsUrl = wsUrl.href.replace(/^http/, 'ws');

    this.ws = new WebSocket(finalWsUrl);
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

      const activeTab = this.$tabs.querySelector('.screencast-tab-item.active');
      if (activeTab) {
        const targetId = activeTab.id.replace('tab-', '');
        this.sendCommand(LIVE_CLIENT.COMMANDS.SET_VIEWPORT, {
          ...params,
          targetId,
        });
      }
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

    const activeTab = this.$tabs.querySelector('.screencast-tab-item.active');
    if (activeTab) {
      const targetId = activeTab.id.replace('tab-', '');
      this.sendCommand(LIVE_CLIENT.COMMANDS.INPUT_EMULATE_TOUCH_FROM_MOUSE_EVENT, {
        ...params,
        targetId,
      });
    }
  }

  private sendCommand(command: string, params: Dictionary = {}) {
    this.ws.send(
      JSON.stringify({
        command,
        params,
        context: {
          session: this.session,
          connectionId: this.connectionId,
        },
      })
    );
  }

  private sendRenewSessionCommand() {
    // Check if we should renew more aggressively based on time
    const now = Date.now();
    const timeSinceLastRenew = now - (this.lastRenewTime || 0);
    const shouldRenewNow = timeSinceLastRenew >= 60000; // At least 1 minute since last renew

    if (!shouldRenewNow) {
      // console.log('⏰ Skipping renew - too soon since last renewal');
      return;
    }

    // console.log(`🔄 Renewing session (${Math.floor(timeSinceLastRenew / 1000)}s since last renew)`);
    this.sendCommand(LIVE_CLIENT.COMMANDS.RENEW_SESSION);
    this.lastRenewTime = now;

    // Set timeout to retry if no response received
    if (this.renewSessionTimeout) {
      clearTimeout(this.renewSessionTimeout);
    }

    this.renewSessionTimeout = setTimeout(() => {
      if (this.renewSessionRetryCount < this.maxRetries) {
        this.renewSessionRetryCount++;
        // console.warn(
        //   `⚠️ Session renewal timeout, retrying (${this.renewSessionRetryCount}/${this.maxRetries})...`
        // );
        this.sendRenewSessionCommand();
      } else {
        // console.error('❌ Session renewal failed after maximum retries');
        this.$notification.classList.remove('hidden');
        this.$notification.textContent = 'Session renewal failed';
      }
    }, 10000); // 10 seconds timeout
  }

  private getNavigationInput() {
    return this.$navigation.querySelector<HTMLInputElement>('input');
  }

  private handleBack(e: MouseEvent) {
    e.preventDefault();

    const activeTab = this.$tabs.querySelector('.screencast-tab-item.active');
    if (activeTab) {
      const targetId = activeTab.id.replace('tab-', '');
      this.sendCommand(LIVE_CLIENT.COMMANDS.GO_BACK, {
        targetId,
      });
    }
  }

  private handleForward(e: MouseEvent) {
    e.preventDefault();

    const activeTab = this.$tabs.querySelector('.screencast-tab-item.active');
    if (activeTab) {
      const targetId = activeTab.id.replace('tab-', '');
      this.sendCommand(LIVE_CLIENT.COMMANDS.GO_FORWARD, {
        targetId,
      });
    }
  }

  private handleReload(e: MouseEvent) {
    e.preventDefault();

    const activeTab = this.$tabs.querySelector('.screencast-tab-item.active');
    if (activeTab) {
      const targetId = activeTab.id.replace('tab-', '');
      this.sendCommand(LIVE_CLIENT.COMMANDS.RELOAD, {
        targetId,
      });
    }
  }

  private handleStop(e: MouseEvent) {
    e.preventDefault();
    this.sendCommand(LIVE_CLIENT.COMMANDS.STOP_SCREENCAST);
  }

  async onOpen(_event: Event) {
    this.connectionId = window.crypto.randomUUID();

    this.sendCommand(LIVE_CLIENT.COMMANDS.REGISTER_SCREENCAST, {
      connectionId: this.connectionId,
    });

    this.interval = setInterval(
      () => {
        // console.log('🔄 Renewing session...');
        this.renewSessionRetryCount = 0;
        this.sendRenewSessionCommand();
      },
      1000 * 60 * 1.5 // 1.5 minutes (90 seconds)
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

      const activeTab = this.$tabs.querySelector('.screencast-tab-item.active');
      if (activeTab) {
        const targetId = activeTab.id.replace('tab-', '');
        self.sendCommand(LIVE_CLIENT.COMMANDS.INPUT_DISPATCH_KEY_EVENT, {
          ...params,
          targetId,
        });
      }
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
  }

  async onMessage(event: MessageEvent) {
    const text = event.data;

    const { context, command, data = {} } = JSON.parse(text) as LiveMessage;

    if (context.connectionId !== this.connectionId) return;

    switch (command) {
      case LIVE_CLIENT.EVENTS.SCREENCAST_REGISTERED: {
        data.forEach(this.createTabItem.bind(this));

        this.resizeWindow();

        break;
      }
      case LIVE_CLIENT.EVENTS.SCREENCAST_FRAME: {
        const { targetId, ...payload } = data;
        this.image.onload = () => {
          this.ctx.drawImage(this.image, 0, 0, this.$canvas.width, this.$canvas.height);
        };
        this.image.src = `data:image/jpeg;base64,${payload.data}`;
        this.sendCommand(LIVE_CLIENT.COMMANDS.SCREENCAST_FRAME_ACK, {
          targetId,
          sessionId: payload.sessionId,
        });
        break;
      }
      case LIVE_CLIENT.EVENTS.TARGET_CREATED: {
        this.createTabItem(data);

        // resize window if the target is active
        if (data.active) {
          this.resizeWindow();
        }

        break;
      }
      case LIVE_CLIENT.EVENTS.TARGET_DESTROYED: {
        this.removeTabItem(data);

        this.resizeWindow();

        break;
      }
      case LIVE_CLIENT.EVENTS.TARGET_BRING_TO_FRONT: {
        this.bringToFrontTab(data.targetId);

        this.resizeWindow();

        break;
      }
      case LIVE_CLIENT.EVENTS.TARGET_STATE_CHANGED: {
        this.updateTabItem(data);

        break;
      }
      case LIVE_CLIENT.EVENTS.FRAME_NAVIGATED: {
        this.updateTabItem(data);
        this.updateNavigationInput(data);

        break;
      }
      case LIVE_CLIENT.EVENTS.RENEW_SESSION_ACK: {
        // console.log('✅ Session renewed successfully');
        this.session = data.session;
        this.renewSessionRetryCount = 0; // Reset retry count on success

        // Clear timeout since we got the response
        if (this.renewSessionTimeout) {
          clearTimeout(this.renewSessionTimeout);
          this.renewSessionTimeout = null;
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

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.renewSessionTimeout) {
      clearTimeout(this.renewSessionTimeout);
      this.renewSessionTimeout = null;
    }
  }

  async onError(_event: Event) {
    // clear canvas
    this.ctx.clearRect(0, 0, this.$canvas.width, this.$canvas.height);

    // clear input
    this.getNavigationInput()!.value = '';

    // show notification
    this.$notification.classList.remove('hidden');
    this.$notification.textContent = 'An error occurred';

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.renewSessionTimeout) {
      clearTimeout(this.renewSessionTimeout);
      this.renewSessionTimeout = null;
    }
  }

  private createTabItem(tab: any) {
    const id = `tab-${tab.targetId}`;

    const existingTabItem = this.$tabs.querySelector<HTMLDivElement>(`#${id}`);
    if (existingTabItem) {
      return existingTabItem;
    }

    const totalTabs = this.$tabs.querySelectorAll('.screencast-tab-item').length;

    const activeTabItem = this.$tabs.querySelector('.screencast-tab-item.active');

    const defaultTitle = `Untitled`;
    const tabTitle = tab.title || defaultTitle;

    const tabItem = document.createElement('div');
    tabItem.id = `tab-${tab.targetId}`;
    tabItem.title = tabTitle;
    tabItem.classList.add('screencast-tab-item');
    if (tab.active) {
      if (activeTabItem) {
        activeTabItem.classList.remove('active');
      }
      tabItem.classList.add('active');
    }
    tabItem.addEventListener('click', () => {
      this.sendCommand(LIVE_CLIENT.COMMANDS.GO_TO_TAB, { targetId: tab.targetId });
    });

    const tabItemIcon = document.createElement('img');
    tabItemIcon.classList.add('favicon');
    tabItemIcon.src = EarthIcon;
    tabItem.appendChild(tabItemIcon);

    const tabItemText = document.createElement('span');
    tabItemText.classList.add('title');
    tabItemText.textContent = tabTitle;
    tabItem.appendChild(tabItemText);

    this.$tabs.appendChild(tabItem);

    // Only show close button if there are multiple tabs
    if (totalTabs > 0) {
      // query all tab items without close button
      const tabItemsWithoutCloseButton = this.$tabs.querySelectorAll(
        '.screencast-tab-item:not(.can-close)'
      );

      tabItemsWithoutCloseButton.forEach((item) => {
        const targetId = item.id.replace('tab-', '');

        const tabItemCloseButton = document.createElement('div');
        tabItemCloseButton.classList.add('close-button');
        tabItemCloseButton.role = 'button';
        tabItemCloseButton.innerHTML = XIcon;
        tabItemCloseButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.sendCommand(LIVE_CLIENT.COMMANDS.CLOSE_TAB, { targetId });
        });
        item.appendChild(tabItemCloseButton);
        item.classList.add('can-close');
      });
    }

    this.updateNavigationInput({ targetId: tab.targetId, url: tab.url });

    return tabItem;
  }

  private removeTabItem({ targetId, activeTargetId }: any) {
    const tabItem = this.$tabs.querySelector<HTMLDivElement>(`#tab-${targetId}`);
    if (!tabItem) return;
    tabItem.remove();

    const activeTabItem = this.$tabs.querySelector(`#tab-${activeTargetId}`);
    if (activeTabItem && !activeTabItem.classList.contains('active')) {
      activeTabItem.classList.add('active');
    }

    // remove close button if there is only one tab
    if (this.$tabs.querySelectorAll('.screencast-tab-item.can-close').length === 1) {
      this.$tabs
        .querySelectorAll('.screencast-tab-item.can-close .close-button')
        .forEach((item) => {
          item.remove();
        });
    }
  }

  private bringToFrontTab(targetId: string) {
    const tabItems = this.$tabs.querySelectorAll<HTMLDivElement>(`.screencast-tab-item.active`);
    tabItems.forEach((tabItem) => {
      tabItem.classList.remove('active');
    });

    const id = `tab-${targetId}`;
    const tabItem = this.$tabs.querySelector<HTMLDivElement>(`#${id}`);
    if (tabItem) {
      tabItem.classList.add('active');
    }
  }

  private updateTabItem(tab: any) {
    const tabItem = this.$tabs.querySelector<HTMLDivElement>(`#tab-${tab.targetId}`);
    if (tabItem) {
      if (tab.title) {
        tabItem.title = tab.title;

        const titleEle = tabItem.querySelector('span.title');
        if (titleEle) {
          titleEle.textContent = tab.title;
        }
      }

      const faviconEle = tabItem.querySelector<HTMLImageElement>('img.favicon');
      if (faviconEle) {
        if (tab.state === 'loading:start') {
          faviconEle.src = LoadingIcon;
          faviconEle.classList.add('loading');
        } else {
          faviconEle.src = tab.favicon || EarthIcon;
          faviconEle.classList.remove('loading');
        }
      }
    }
  }

  private updateNavigationInput({ targetId, url }: any) {
    const tabItem = this.$tabs.querySelector<HTMLDivElement>(`#tab-${targetId}.active`);
    if (tabItem) {
      const input = this.$navigation.querySelector('input') as HTMLInputElement;
      const _url = new URL(url);

      input.value =
        _url.href.replace(_url.origin, '') === '/' ? _url.href.replace(/\/$/, '') : _url.href;
    }
  }
}
