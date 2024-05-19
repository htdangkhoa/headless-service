import { ScreencastView } from './screencast-view';

export class ScreencastApp {
  static instance: ScreencastApp;

  private screencastView?: ScreencastView;

  static getInstance() {
    if (!this.instance) {
      this.instance = new ScreencastApp();
    }
    return this.instance;
  }

  render(container: HTMLElement) {
    if (this.screencastView) {
      this.close();
    }

    this.screencastView = new ScreencastView(container);
  }

  close() {
    this.screencastView = undefined;
  }
}
