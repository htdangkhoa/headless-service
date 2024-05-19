import { WebSocketServer } from 'ws';
import { PuppeteerExtraPluginLiveUrl } from './live-url-plugin';

const LiveUrlPlugin = (ws: WebSocketServer) => new PuppeteerExtraPluginLiveUrl(ws);

export default LiveUrlPlugin;
